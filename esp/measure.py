"""Repeat fixed position searches. Reports host pipes or physical serial honestly."""
import argparse
import hashlib
import json
import platform
from pathlib import Path
import struct
import subprocess
import time
import chess
from board_client import HostTransport, SerialTransport, decode_search_result, decode_device_info, read_telemetry
from conformance import POSITIONS

FIXED = {**{k:v for k,v in POSITIONS.items() if k not in ("checkmate","stalemate")},
    "middlegame": "r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P4/2PBPN2/PP1N1PPP/R1BQ1RK1 w - - 0 8",
    "kiwipete": "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"}

def digest(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest() if path else None

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--host"); group.add_argument("--port")
    parser.add_argument("--model"); parser.add_argument("--firmware")
    parser.add_argument("--metadata",help="JSON with physical board revision, clock, heap, stack and watchdog observations")
    parser.add_argument("--runs",type=int,default=3); parser.add_argument("--time-ms",type=int,default=100)
    parser.add_argument("--output",required=True)
    args = parser.parse_args()
    if not 1 <= args.runs <= 100 or not 1 <= args.time_ms <= 5000: parser.error("runs 1 through 100 and milliseconds 1 through 5000 required")
    transport = HostTransport([args.host]+(["--model",args.model] if args.model else [])) if args.host else SerialTransport(args.port,115200,10)
    observations = []
    with transport as board:
        if board.request(1) != b"\x01": raise ValueError("Hello failed")
        info = decode_device_info(board.request(2))
        for name,fen in FIXED.items():
            for run in range(args.runs):
                started = time.monotonic_ns()
                board.request(32,fen.encode("ascii"))
                result = decode_search_result(board.request(33,struct.pack("<BI",2,args.time_ms)))
                elapsed = (time.monotonic_ns()-started)/1e6
                if chess.Move.from_uci(result["move"]) not in chess.Board(fen).legal_moves: raise ValueError(f"illegal reply for {name}")
                observations.append({"position":name,"fen":fen,"run":run+1,"requested_ms":args.time_ms,
                    "client_round_trip_ms":elapsed,"device_overshoot_ms":max(0,result["elapsed_ms"]-args.time_ms),
                    "telemetry":read_telemetry(board),**result})
    root = Path(__file__).resolve().parents[1]
    def git(*command): return subprocess.check_output(["git",*command],cwd=root,text=True).strip()
    report = {"execution":"host pipes" if args.host else "physical serial", "source_revision":git("rev-parse","HEAD"),
        "working_tree":git("status","--short"),"host":platform.platform(),"serial_baud":115200 if args.port else None,
        "firmware_sha256":digest(args.firmware),"model_sha256":digest(args.model),"host_binary_sha256":digest(args.host),
        "device_info":info,"clock_domains":{"client":"Python monotonic nanoseconds converted to ms","device":"device reported search milliseconds"},
        "physical_metadata":json.loads(Path(args.metadata).read_text()) if args.metadata else None,
        "observations":observations,"strength_claim":None}
    Path(args.output).write_text(json.dumps(report,indent=2)+"\n")
    print(f"Recorded {len(observations)} {report['execution']} observations in {args.output}")

if __name__ == "__main__": main()
