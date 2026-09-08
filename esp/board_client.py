#!/usr/bin/env python3

import argparse
import binascii
import os
import select
import struct
import sys
import termios
import time
import tty
import re
import subprocess
import threading
import fcntl


MAGIC = b"P4"
PROTOCOL_VERSION = 1
HEADER_SIZE = 6
CRC_SIZE = 4
MAX_PAYLOAD = 1024
MODEL_CHUNK_BYTES = MAX_PAYLOAD - 4

COMMAND_HELLO = 0x01
COMMAND_DEVICE_INFO = 0x02
COMMAND_FIRMWARE_INFO = 0x03
COMMAND_MODEL_INFO = 0x04
COMMAND_CAPABILITIES = 0x05
COMMAND_MODEL_BEGIN = 0x10
COMMAND_MODEL_CHUNK = 0x11
COMMAND_MODEL_COMMIT = 0x12
COMMAND_POSITION = 0x20
COMMAND_GO = 0x21
COMMAND_BENCH = 0x22
COMMAND_ERROR = 0xFF

GO_DEPTH = 1
GO_TIME_MS = 2

MODEL_STATES = {
    0: "none",
    1: "embedded",
    2: "uploaded",
}

TARGETS = {
    0: "unknown",
    1: "esp32p4",
}

ERRORS = {
    0: "none",
    1: "unsupported protocol version",
    2: "invalid frame length",
    3: "checksum mismatch",
    4: "unknown command",
    5: "invalid payload",
    6: "model too large",
    7: "model chunk out of sequence",
    8: "model upload incomplete",
    9: "model invalid",
    10: "storage failure",
    11: "invalid fen",
    12: "position required",
    13: "engine unavailable or search allocation failed",
}


class ProtocolError(RuntimeError):
    pass


class BoardCommandError(ProtocolError):
    def __init__(self, command, code):
        self.command, self.code = command, code
        super().__init__(f"command 0x{command:02x}: {ERRORS.get(code, 'unknown error')}")


def encode_frame(command, payload=b"", version=PROTOCOL_VERSION):
    if len(payload) > MAX_PAYLOAD:
        raise ValueError("payload exceeds protocol maximum")
    header = MAGIC + struct.pack("<BBH", version, command, len(payload))
    checksum = binascii.crc32(header[2:] + payload) & 0xFFFFFFFF
    return header + payload + struct.pack("<I", checksum)


class FrameDecoder:
    def __init__(self):
        self.buffer = bytearray()

    def feed(self, data):
        self.buffer.extend(data)
        frames = []
        while True:
            start = self.buffer.find(MAGIC)
            if start < 0:
                if self.buffer[-1:] == MAGIC[:1]:
                    self.buffer[:] = self.buffer[-1:]
                else:
                    self.buffer.clear()
                return frames
            if start:
                del self.buffer[:start]
            if len(self.buffer) < HEADER_SIZE:
                return frames
            version, command, payload_size = struct.unpack_from(
                "<BBH", self.buffer, 2
            )
            if payload_size > MAX_PAYLOAD:
                del self.buffer[0]
                raise ProtocolError("invalid frame length")
            frame_size = HEADER_SIZE + payload_size + CRC_SIZE
            if len(self.buffer) < frame_size:
                return frames
            frame = bytes(self.buffer[:frame_size])
            del self.buffer[:frame_size]
            checksum = struct.unpack_from("<I", frame, frame_size - CRC_SIZE)[0]
            actual = binascii.crc32(frame[2:-CRC_SIZE]) & 0xFFFFFFFF
            if checksum != actual:
                raise ProtocolError("response checksum mismatch")
            if version != PROTOCOL_VERSION:
                raise ProtocolError(f"unsupported response version {version}")
            frames.append((command, frame[HEADER_SIZE:-CRC_SIZE]))


class SerialTransport:
    def __init__(self, path, baud, timeout):
        self.path = path
        self.baud = baud
        self.timeout = timeout
        self.fd = None
        self.decoder = FrameDecoder()
        self.lock = threading.Lock()

    def __enter__(self):
        speed_name = f"B{self.baud}"
        if not hasattr(termios, speed_name):
            raise ValueError(f"unsupported baud rate {self.baud}")
        self.fd = os.open(self.path, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
        try:
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            tty.setraw(self.fd)
            attributes = termios.tcgetattr(self.fd)
            speed = getattr(termios, speed_name)
            attributes[4] = speed
            attributes[5] = speed
            termios.tcsetattr(self.fd, termios.TCSANOW, attributes)
            # Reset before reopening an abandoned session. A drain is not Stop.
            until = time.monotonic() + 5.5
            while time.monotonic() < until:
                if select.select([self.fd], [], [], max(0, until-time.monotonic()))[0]:
                    try:
                        if not os.read(self.fd, 4096): raise EOFError("serial device closed during startup")
                    except BlockingIOError: pass
            self.decoder = FrameDecoder()
        except BaseException:
            self.__exit__(None, None, None)
            raise
        return self

    def __exit__(self, exception_type, exception, traceback):
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None

    def request(self, command, payload=b"", timeout=None):
        with self.lock:
            try:
                return self._request(command, payload, timeout)
            except BoardCommandError:
                raise
            except (TimeoutError, EOFError, OSError, ProtocolError):
                self.__exit__(None, None, None)
                raise

    def _request(self, command, payload=b"", timeout=None):
        if self.fd is None:
            raise EOFError("connection is closed; reset before reconnecting")
        frame = encode_frame(command, payload)
        written = 0
        deadline = time.monotonic() + (self.timeout if timeout is None else timeout)
        output = getattr(self, "write_fd", self.fd)
        while written < len(frame):
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not select.select([], [output], [], remaining)[1]:
                raise TimeoutError("request write timed out")
            try: count = os.write(output, frame[written:])
            except BlockingIOError: continue
            if count == 0:
                raise EOFError("connection made no write progress")
            written += count
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("board response timed out")
            readable, _, _ = select.select([self.fd], [], [], remaining)
            if not readable:
                raise TimeoutError("board response timed out")
            try: data = os.read(self.fd, 4096)
            except BlockingIOError: continue
            if not data:
                raise EOFError("serial device closed")
            frames = self.decoder.feed(data)
            if len(frames) > 1:
                raise ProtocolError("unsolicited combined responses; reset before reconnecting")
            for response_command, response_payload in frames:
                if response_command == COMMAND_ERROR:
                    if len(response_payload) != 2 or response_payload[0] != command:
                        raise ProtocolError("error response did not match the request")
                    self._raise_board_error(response_payload)
                expected = command | 0x80
                if response_command != expected:
                    raise ProtocolError(
                        f"expected response 0x{expected:02x} got 0x{response_command:02x}"
                    )
                return response_payload

    @staticmethod
    def _raise_board_error(payload):
        if len(payload) != 2:
            raise ProtocolError("malformed board error")
        command, error = payload
        raise BoardCommandError(command, error)


class HostTransport(SerialTransport):
    """Interactive child pipes. No serial device and no hardware claim."""
    def __init__(self, command, timeout=10):
        super().__init__(None, None, timeout)
        self.command = command
        self.process = None

    def __enter__(self):
        self.process = subprocess.Popen(self.command, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        self.fd = self.process.stdout.fileno()
        self.write_fd = self.process.stdin.fileno()
        os.set_blocking(self.write_fd, False)
        return self

    def __exit__(self, *args):
        self.fd = None
        if self.process is not None:
            self.process.stdin.close()
            try:
                self.process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                self.process.terminate()
                self.process.wait(timeout=2)
            self.process.stdout.close()
            self.process = None


def ascii_text(data):
    if any(byte < 32 or byte > 126 for byte in data):
        raise ProtocolError("text must use printable ASCII")
    return data.decode("ascii")


def read_telemetry(board):
    try:
        payload = board.request(6)
    except BoardCommandError as error:
        if (error.command, error.code) == (6, 4): return None
        raise
    require_size("telemetry", payload, 22)
    if payload[0] != 1: raise ProtocolError("unsupported telemetry schema")
    names = ("internal_free_bytes", "internal_minimum_free_bytes", "psram_free_bytes", "psram_minimum_free_bytes", "task_minimum_free_stack_bytes")
    values = struct.unpack_from("<5I", payload, 2)
    return {name: values[i] if payload[1] & (1 << i) else None for i,name in enumerate(names)}


def require_size(name, payload, size):
    if len(payload) != size:
        raise ProtocolError(f"malformed {name} response")


def decode_device_info(payload):
    if len(payload) < 26:
        raise ProtocolError("malformed device info response")
    values = struct.unpack_from("<BBBHHHIIIIB", payload)
    version_size = values[-1]
    if version_size > 31 or len(payload) != 26 + version_size:
        raise ProtocolError("malformed device version string")
    return {
        "protocol": values[0],
        "target": TARGETS.get(values[1], f"unknown-{values[1]}"),
        "device_identity": "unverified firmware report",
        "model_state": MODEL_STATES.get(values[2], f"unknown-{values[2]}"),
        "model_format": values[3],
        "king_buckets": values[4],
        "hidden_width": values[5],
        "maximum_model_bytes": values[6],
        "active_model_bytes": values[7],
        "active_model_crc32": values[8],
        "transposition_table_bytes": values[9],
        "firmware": ascii_text(payload[26:]),
    }


def decode_model_info(payload):
    require_size("model info", payload, 19)
    values = struct.unpack("<BIIIHHH", payload)
    return {
        "state": MODEL_STATES.get(values[0], f"unknown-{values[0]}"),
        "bytes": values[1],
        "crc32": values[2],
        "maximum_bytes": values[3],
        "format": values[4],
        "king_buckets": values[5],
        "hidden_width": values[6],
    }


def decode_capabilities(payload):
    if len(payload) < 11:
        raise ProtocolError("malformed capability response")
    extension, features, maximum_depth, maximum_time, engine_size, firmware_size = (
        struct.unpack_from("<BHHIBB", payload)
    )
    if extension != 1 or not 1 <= engine_size <= 31 or not 1 <= firmware_size <= 31 or \
            len(payload) != 11 + engine_size + firmware_size:
        raise ProtocolError("malformed capability response")
    if (features & 1 and maximum_depth == 0) or (features & 2 and maximum_time == 0):
        raise ProtocolError("supported search mode has no valid budget")
    start = 11
    return {
        "extension": extension,
        "features": features,
        "maximum_depth": maximum_depth,
        "maximum_time_ms": maximum_time,
        "engine": ascii_text(payload[start:start + engine_size]),
        "firmware_identity": ascii_text(payload[start + engine_size:]),
    }


def decode_search_result(payload):
    require_size("search", payload, 29)
    move_size = payload[0]
    if move_size > 5:
        raise ProtocolError("malformed search move")
    move = ascii_text(payload[1:1 + move_size])
    if not re.fullmatch(r"0000|[a-h][1-8][a-h][1-8][qrbn]?", move):
        raise ProtocolError("invalid move encoding")
    score, depth = struct.unpack_from("<iH", payload, 6)
    nodes = struct.unpack_from("<Q", payload, 12)[0]
    elapsed_ms = struct.unpack_from("<I", payload, 20)[0]
    model_crc32 = struct.unpack_from("<I", payload, 25)[0]
    return {
        "move": move,
        "score": score,
        "depth": depth,
        "nodes": nodes,
        "elapsed_ms": elapsed_ms,
        "model_state": MODEL_STATES.get(payload[24], f"unknown-{payload[24]}"),
        "model_crc32": model_crc32,
    }


def print_mapping(values):
    for name, value in values.items():
        if name.endswith("crc32"):
            value = f"{value:08x}"
        print(f"{name}: {value}")


def show_info(board):
    hello = board.request(COMMAND_HELLO)
    require_size("hello", hello, 1)
    device = decode_device_info(board.request(COMMAND_DEVICE_INFO))
    firmware_payload = board.request(COMMAND_FIRMWARE_INFO)
    if not firmware_payload or len(firmware_payload) != firmware_payload[0] + 1:
        raise ProtocolError("malformed firmware info response")
    model = decode_model_info(board.request(COMMAND_MODEL_INFO))
    print_mapping(device)
    print(f"firmware_info: {firmware_payload[1:].decode('ascii', 'replace')}")
    print_mapping({f"model_{name}": value for name, value in model.items()})


def upload_model(board, path):
    with open(path, "rb") as model_file:
        model = model_file.read(328481)
    validate_reference_model(model)
    device = decode_device_info(board.request(COMMAND_DEVICE_INFO))
    if (device["protocol"], device["target"], device["model_format"],
            device["king_buckets"], device["hidden_width"]) != (1, "esp32p4", 3, 4, 128) or \
            device["maximum_model_bytes"] < len(model):
        raise ValueError("reference uploader requires the ESP32 P4 format 3 profile and sufficient storage")
    checksum = binascii.crc32(model) & 0xFFFFFFFF
    board.request(COMMAND_MODEL_BEGIN, struct.pack("<II", len(model), checksum))
    for offset in range(0, len(model), MODEL_CHUNK_BYTES):
        chunk = model[offset:offset + MODEL_CHUNK_BYTES]
        board.request(COMMAND_MODEL_CHUNK, struct.pack("<I", offset) + chunk)
    board.request(COMMAND_MODEL_COMMIT)
    print(f"uploaded {len(model)} bytes crc32 {checksum:08x}")


def validate_reference_model(model):
    """Exact reference upload profile. Ordinary play has no such restriction."""
    expected = (b"P4NNUE1\0", 3, 4, 640, 128, 127, 64, 64, 2, 328480)
    if len(model) != 328480 or struct.unpack_from("<8s8HI", model) != expected:
        raise ValueError("invalid reference model header or byte size")
    if any(not -28928 <= bias <= 28957 for bias in struct.unpack_from("<128h", model, 32)):
        raise ValueError("unsafe reference model accumulator bias")


def set_position(board, fen):
    payload = fen.encode("ascii")
    board.request(COMMAND_POSITION, payload)


def run_search(board, fen, depth, time_ms, timeout):
    if depth is not None and not 1 <= depth <= 12:
        raise ValueError("depth must be between 1 and 12 with a five second search cap")
    if depth is None and (time_ms is None or not 1 <= time_ms <= 5000):
        raise ValueError("time budget must be between 1 and 5000 milliseconds")
    set_position(board, fen)
    if depth is not None:
        budget_type = GO_DEPTH
        budget = depth
        response_timeout = timeout
    else:
        budget_type = GO_TIME_MS
        budget = time_ms
        response_timeout = max(timeout, time_ms / 1000.0 + 5.0)
    payload = struct.pack("<BI", budget_type, budget)
    result = decode_search_result(
        board.request(COMMAND_GO, payload, response_timeout)
    )
    print_mapping(result)


def run_benchmark(board, timeout):
    result = decode_search_result(
        board.request(COMMAND_BENCH, timeout=max(timeout, 60.0))
    )
    print_mapping(result)


def make_argument_parser():
    parser = argparse.ArgumentParser(description="esp32 p4 nnue board client")
    parser.add_argument("--port", required=True, help="serial device path")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--timeout", type=float, default=30.0)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("info")
    upload = commands.add_parser("upload")
    upload.add_argument("model")
    position = commands.add_parser("position")
    position.add_argument("fen")
    search = commands.add_parser("search")
    search.add_argument("fen")
    budget = search.add_mutually_exclusive_group(required=True)
    budget.add_argument("--depth", type=int)
    budget.add_argument("--time-ms", type=int)
    commands.add_parser("bench")
    return parser


def main():
    arguments = make_argument_parser().parse_args()
    try:
        with SerialTransport(arguments.port, arguments.baud,
                             arguments.timeout) as board:
            if arguments.command == "info":
                show_info(board)
            elif arguments.command == "upload":
                upload_model(board, arguments.model)
            elif arguments.command == "position":
                set_position(board, arguments.fen)
                print("position accepted")
            elif arguments.command == "search":
                run_search(board, arguments.fen, arguments.depth,
                           arguments.time_ms, arguments.timeout)
            elif arguments.command == "bench":
                run_benchmark(board, arguments.timeout)
    except (OSError, ValueError, ProtocolError, TimeoutError, EOFError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
