#!/usr/bin/env python3

import binascii
import importlib.util
from pathlib import Path
import struct
import unittest


CLIENT_PATH = Path(__file__).resolve().parents[1] / "esp" / "board_client.py"
SPEC = importlib.util.spec_from_file_location("board_client", CLIENT_PATH)
board_client = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(board_client)


class FrameTests(unittest.TestCase):
    def test_encoding(self):
        frame = board_client.encode_frame(board_client.COMMAND_HELLO)
        self.assertEqual(frame[:6], b"P4\x01\x01\x00\x00")
        self.assertEqual(
            struct.unpack_from("<I", frame, 6)[0],
            binascii.crc32(frame[2:6]) & 0xFFFFFFFF,
        )

    def test_partial_and_multiple_frames(self):
        first = board_client.encode_frame(board_client.COMMAND_HELLO, b"\x01")
        second = board_client.encode_frame(
            board_client.COMMAND_MODEL_INFO, b"model"
        )
        decoder = board_client.FrameDecoder()
        self.assertEqual(decoder.feed(b"boot text\n" + first[:4]), [])
        frames = decoder.feed(first[4:] + second)
        self.assertEqual(
            frames,
            [
                (board_client.COMMAND_HELLO, b"\x01"),
                (board_client.COMMAND_MODEL_INFO, b"model"),
            ],
        )

    def test_bad_checksum(self):
        frame = bytearray(board_client.encode_frame(board_client.COMMAND_HELLO))
        frame[-1] ^= 1
        with self.assertRaises(board_client.ProtocolError):
            board_client.FrameDecoder().feed(frame)

    def test_bad_version(self):
        frame = board_client.encode_frame(
            board_client.COMMAND_HELLO, version=2
        )
        with self.assertRaises(board_client.ProtocolError):
            board_client.FrameDecoder().feed(frame)


class PayloadTests(unittest.TestCase):
    def test_reference_upload_rejects_header_and_numeric_mismatch(self):
        model = (CLIENT_PATH.parents[1] / "models/reference.nnue").read_bytes()
        board_client.validate_reference_model(model)
        for bad in (model[:-1], model + b"x", b"badmagic" + model[8:]):
            with self.assertRaises(ValueError): board_client.validate_reference_model(bad)
        bad = bytearray(model)
        struct.pack_into("<h", bad, 32, 32767)
        with self.assertRaises(ValueError): board_client.validate_reference_model(bad)

    def test_upload_does_not_send_model_to_custom_target(self):
        class Board:
            commands = []
            def request(self, command, payload=b""):
                self.commands.append(command)
                return struct.pack("<BBBHHHIIIIB", 1, 0, 0, 3, 4, 128, 328480, 0, 0, 0, 0)
        board = Board()
        with self.assertRaises(ValueError):
            board_client.upload_model(board, CLIENT_PATH.parents[1] / "models/reference.nnue")
        self.assertEqual(board.commands, [2])

    def test_telemetry_availability_and_legacy_fallback(self):
        class Board:
            def request(self, command):
                return struct.pack("<BB5I", 1, 0x13, 100, 90, 0, 0, 800)
        self.assertEqual(board_client.read_telemetry(Board())["internal_free_bytes"], 100)
        self.assertIsNone(board_client.read_telemetry(Board())["psram_free_bytes"])
        class Legacy:
            def request(self, command): raise board_client.BoardCommandError(command, 4)
        self.assertIsNone(board_client.read_telemetry(Legacy()))

    def test_shared_vectors(self):
        for line in (Path(__file__).parent / "protocol_vectors.tsv").read_text().splitlines():
            name, value = line.split("\t")
            raw = bytes.fromhex(value)
            command, payload = board_client.FrameDecoder().feed(raw)[0]
            self.assertEqual(board_client.encode_frame(command, payload), raw, name)

    def test_invalid_text_and_large_nodes(self):
        with self.assertRaises(board_client.ProtocolError):
            board_client.decode_search_result(bytes(29))
        payload = bytearray(29)
        payload[0] = 4
        payload[1:5] = b"e2e4"
        struct.pack_into("<Q", payload, 12, 9007199254740993)
        self.assertEqual(board_client.decode_search_result(payload)["nodes"], 9007199254740993)

    def test_device_info(self):
        payload = struct.pack(
            "<BBBHHHIIIIB", 1, 1, 2, 3, 4, 128,
            328480, 328480, 0x12345678, 262144, 3
        ) + b"1.0"
        info = board_client.decode_device_info(payload)
        self.assertEqual(info["target"], "esp32p4")
        self.assertEqual(info["device_identity"], "unverified firmware report")
        self.assertEqual(info["model_state"], "uploaded")
        self.assertEqual(info["active_model_crc32"], 0x12345678)

    def test_search_result(self):
        payload = bytearray(29)
        payload[0] = 4
        payload[1:5] = b"e2e4"
        struct.pack_into("<iHQIBI", payload, 6, -24, 7, 1234, 18, 1,
                         0x89ABCDEF)
        result = board_client.decode_search_result(payload)
        self.assertEqual(result["move"], "e2e4")
        self.assertEqual(result["score"], -24)
        self.assertEqual(result["depth"], 7)
        self.assertEqual(result["nodes"], 1234)

    def test_capabilities(self):
        payload = struct.pack("<BHHIBB", 1, 3, 12, 5000, 6, 4) + b"CustomHost"
        capabilities = board_client.decode_capabilities(payload)
        self.assertEqual(capabilities["engine"], "Custom")
        self.assertEqual(capabilities["firmware_identity"], "Host")


if __name__ == "__main__":
    unittest.main()
