from pathlib import Path
import os
import selectors
import subprocess
import sys
import time
import unittest

ENGINE = Path(sys.argv.pop(1)).resolve()
MODEL = Path(__file__).parents[1] / "models/reference.nnue"


class UciTest(unittest.TestCase):
    def start(self, *args: str) -> subprocess.Popen:
        process = subprocess.Popen([str(ENGINE), *args], stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.addCleanup(self.close, process)
        self.buffer = b""
        return process

    def close(self, process: subprocess.Popen) -> None:
        if process.poll() is None:
            process.kill()
        process.wait(timeout=2)
        for stream in (process.stdin, process.stdout, process.stderr):
            stream.close()

    def send(self, process: subprocess.Popen, text: str) -> None:
        process.stdin.write((text + "\n").encode())
        process.stdin.flush()

    def read_until(self, process: subprocess.Popen, expected: str) -> list[str]:
        deadline = time.monotonic() + 3
        lines = []
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            while True:
                while b"\n" in self.buffer:
                    line, self.buffer = self.buffer.split(b"\n", 1)
                    text = line.decode()
                    lines.append(text)
                    if text == expected or text.startswith(expected + " "):
                        return lines
                remaining = deadline - time.monotonic()
                if remaining <= 0 or not selector.select(remaining):
                    self.fail(f"engine timeout waiting for {expected}: {lines}")
                chunk = os.read(process.stdout.fileno(), 65536)
                if not chunk:
                    self.fail(f"engine exited waiting for {expected}: {lines}")
                self.buffer += chunk

    def test_queued_stop(self) -> None:
        process = self.start("--classical")
        start = time.monotonic()
        out, _ = process.communicate(b"position startpos\ngo movetime 750\nstop\nisready\nquit\n", timeout=3)
        self.assertLess(time.monotonic() - start, 0.65)
        lines = out.decode().splitlines()
        moves = [line for line in lines if line.startswith("bestmove ")]
        self.assertEqual(len(moves), 1)
        self.assertNotEqual(moves[0], "bestmove 0000")
        self.assertLess(lines.index(moves[0]), lines.index("readyok"))

    def test_infinite_ready_overlap_and_eof(self) -> None:
        process = self.start("--classical")
        self.send(process, "position startpos\ngo infinite\nisready")
        lines = self.read_until(process, "readyok")
        self.assertFalse(any(line.startswith("bestmove") for line in lines))
        self.send(process, "go infinite\nisready")
        lines = self.read_until(process, "readyok")
        self.assertEqual(sum(line.startswith("bestmove") for line in lines), 1)
        process.stdin.close()
        lines = self.read_until(process, "bestmove")
        self.assertNotEqual(lines[-1], "bestmove 0000")
        self.assertEqual(process.wait(timeout=3), 0)

    def test_model_and_transactional_position(self) -> None:
        process = self.start("--model", str(MODEL))
        self.send(process, "uci\neval")
        lines = self.read_until(process, "info string eval")
        self.assertIn("info string eval 32", lines)
        self.assertTrue(any(str(MODEL) in line for line in lines))
        for command in ("position fen not a fen", "position startpos moves e2e4 bad",
                        "setoption name EvalFile value /no/such/model"):
            self.send(process, command + "\neval")
            self.assertEqual(self.read_until(process, "info string eval")[-1], "info string eval 32")
        self.send(process, "setoption name EvalFile value <empty>\neval")
        self.assertEqual(self.read_until(process, "info string eval")[-1], "info string eval 0")
        self.send(process, f"setoption name EvalFile value {MODEL}\neval")
        self.assertEqual(self.read_until(process, "info string eval")[-1], "info string eval 32")

    def test_bad_options_and_missing_model(self) -> None:
        result = subprocess.run([str(ENGINE), "--model", "/no/such/model"], capture_output=True, timeout=3)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"model load failed", result.stderr)
        process = self.start()
        self.send(process, "setoption name Hash value 0\nsetoption name Hash value 257\ngo depth -1\ngo movetime 18446744073709551616\ngo infinite depth 2\nisready")
        lines = self.read_until(process, "readyok")
        self.assertEqual(sum("invalid" in line for line in lines), 5)
        self.send(process, "x" * 4200 + "\nposition startpos\nperft 1\nisready")
        lines = self.read_until(process, "readyok")
        self.assertIn("info string command too long", lines)
        self.assertTrue(any("perft 1 nodes 20" in line for line in lines))


if __name__ == "__main__":
    unittest.main()
