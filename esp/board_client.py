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
}


class ProtocolError(RuntimeError):
    pass


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

    def __enter__(self):
        speed_name = f"B{self.baud}"
        if not hasattr(termios, speed_name):
            raise ValueError(f"unsupported baud rate {self.baud}")
        self.fd = os.open(self.path, os.O_RDWR | os.O_NOCTTY)
        tty.setraw(self.fd)
        attributes = termios.tcgetattr(self.fd)
        speed = getattr(termios, speed_name)
        attributes[4] = speed
        attributes[5] = speed
        termios.tcsetattr(self.fd, termios.TCSANOW, attributes)
        termios.tcflush(self.fd, termios.TCIOFLUSH)
        return self

    def __exit__(self, exception_type, exception, traceback):
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None

    def request(self, command, payload=b"", timeout=None):
        frame = encode_frame(command, payload)
        written = 0
        while written < len(frame):
            written += os.write(self.fd, frame[written:])
        deadline = time.monotonic() + (self.timeout if timeout is None else timeout)
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("board response timed out")
            readable, _, _ = select.select([self.fd], [], [], remaining)
            if not readable:
                raise TimeoutError("board response timed out")
            data = os.read(self.fd, 4096)
            if not data:
                raise EOFError("serial device closed")
            for response_command, response_payload in self.decoder.feed(data):
                if response_command == COMMAND_ERROR:
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
        message = ERRORS.get(error, f"unknown error {error}")
        raise ProtocolError(f"command 0x{command:02x}: {message}")


def require_size(name, payload, size):
    if len(payload) != size:
        raise ProtocolError(f"malformed {name} response")


def decode_device_info(payload):
    if len(payload) < 26:
        raise ProtocolError("malformed device info response")
    values = struct.unpack_from("<BBBHHHIIIIB", payload)
    version_size = values[-1]
    if len(payload) != 26 + version_size:
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
        "firmware": payload[26:].decode("ascii", "replace"),
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


def decode_search_result(payload):
    require_size("search", payload, 29)
    move_size = payload[0]
    if move_size > 5:
        raise ProtocolError("malformed search move")
    score, depth = struct.unpack_from("<iH", payload, 6)
    nodes = struct.unpack_from("<Q", payload, 12)[0]
    elapsed_ms = struct.unpack_from("<I", payload, 20)[0]
    model_crc32 = struct.unpack_from("<I", payload, 25)[0]
    return {
        "move": payload[1:1 + move_size].decode("ascii", "strict"),
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
        model = model_file.read()
    checksum = binascii.crc32(model) & 0xFFFFFFFF
    board.request(COMMAND_MODEL_BEGIN, struct.pack("<II", len(model), checksum))
    for offset in range(0, len(model), MODEL_CHUNK_BYTES):
        chunk = model[offset:offset + MODEL_CHUNK_BYTES]
        board.request(COMMAND_MODEL_CHUNK, struct.pack("<I", offset) + chunk)
    board.request(COMMAND_MODEL_COMMIT)
    print(f"uploaded {len(model)} bytes crc32 {checksum:08x}")


def set_position(board, fen):
    payload = fen.encode("ascii")
    board.request(COMMAND_POSITION, payload)


def run_search(board, fen, depth, time_ms, timeout):
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
