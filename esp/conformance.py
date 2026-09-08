#!/usr/bin/env python3
"""Check framing, identity, validation and legal play. Never upload or flash."""
import argparse
import json
import struct
import sys
import chess
from board_client import (SerialTransport, HostTransport, BoardCommandError,
    ProtocolError, decode_device_info, decode_capabilities, decode_search_result)

POSITIONS = {
    "start": chess.STARTING_FEN,
    "after e4": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    "promotion": "7k/P7/8/8/8/8/8/7K w - - 0 1",
    "castling": "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
    "checkmate": "7k/6Q1/6K1/8/8/8/8/8 b - - 0 1",
    "stalemate": "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",
}


def conform(board):
    operation = "Hello"
    try:
        if board.request(1) != b"\x01":
            raise ProtocolError("expected protocol version 1")
        operation = "Device info"
        info = decode_device_info(board.request(2))
        if info["protocol"] != 1:
            raise ProtocolError("device info version differs from Hello")
        operation = "Capabilities"
        try:
            caps = decode_capabilities(board.request(5))
        except BoardCommandError as error:
            if (error.command, error.code) != (5, 4):
                raise
            caps = None
        flags = caps["features"] if caps else 3
        if not flags & 3:
            raise ProtocolError("no supported search mode")
        kind = 1 if flags & 1 else 2
        budget = 1 if kind == 1 else min(50, caps["maximum_time_ms"])
        operation = "Unknown command"
        try:
            board.request(0x7e)
            raise ProtocolError("unknown command was accepted")
        except BoardCommandError as error:
            if (error.command, error.code) != (0x7e, 4):
                raise
        observations = []
        for name, fen in POSITIONS.items():
            operation = f"Position: {name}"
            if board.request(0x20, fen.encode("ascii")) != b"":
                raise ProtocolError("position acknowledgement must be empty")
            operation = f"Go: {name}"
            result = decode_search_result(board.request(0x21, struct.pack("<BI", kind, budget)))
            game = chess.Board(fen)
            if result["move"] == "0000":
                if any(game.legal_moves):
                    raise ProtocolError("terminal marker returned while legal moves exist")
            elif chess.Move.from_uci(result["move"]) not in game.legal_moves:
                raise ProtocolError(f"illegal move {result['move']}")
            observations.append({"position": name, **result})
        operation = "Invalid position"
        try:
            board.request(0x20, b"not a fen\x00")
            raise ProtocolError("invalid position was accepted")
        except BoardCommandError as error:
            if error.command != 0x20 or error.code not in (5, 11):
                raise
        return {"info": info, "capabilities": caps, "observations": observations}
    except (ProtocolError, OSError, EOFError, TimeoutError, ValueError) as error:
        raise ProtocolError(f"{operation}: {error}. Check command bytes and callback results against docs/PROTOCOL.md. Reset before retrying a timed out connection.") from error


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    connection = parser.add_mutually_exclusive_group(required=True)
    connection.add_argument("--port")
    connection.add_argument("--host", help="path to p4hostdevice, executed locally")
    parser.add_argument("--model", help="optional host model path")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--timeout", type=float, default=10)
    args = parser.parse_args()
    transport = HostTransport([args.host] + (["--model", args.model] if args.model else []), args.timeout) if args.host else SerialTransport(args.port, args.baud, args.timeout)
    try:
        with transport as board:
            report = conform(board)
        print(json.dumps({"execution": "host pipes" if args.host else "physical serial", **report}, indent=2))
        return 0
    except (ProtocolError, OSError, EOFError, TimeoutError) as error:
        print(f"Conformance failed at {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
