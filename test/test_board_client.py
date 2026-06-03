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


if __name__ == "__main__":
    unittest.main()
