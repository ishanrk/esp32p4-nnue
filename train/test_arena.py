from __future__ import annotations

import unittest
from unittest.mock import patch
from pathlib import Path
import subprocess
import sys
import time

from arena import OPENINGS, UciEngine, elo_summary, load_openings, opening_board, run_match


class ArenaTest(unittest.TestCase):
    def test_time_limit_rejected_before_starting_engine(self) -> None:
        with self.assertRaisesRegex(ValueError, "time budget"):
            run_match("missing", None, "missing", None, depth=1, max_plies=1,
                      opening_count=1, estimate_elo=False, time_ms=0)

    def test_stalled_child_is_bounded_and_closed(self) -> None:
        popen = subprocess.Popen
        children = []
        def stalled(*args, **kwargs):
            process = popen([sys.executable, "-c", "import sys,time; print('stalled fixture', file=sys.stderr, flush=True); time.sleep(10)"], **kwargs)
            children.append(process)
            return process
        start = time.monotonic()
        with patch("arena.subprocess.Popen", side_effect=stalled):
            with self.assertRaisesRegex(RuntimeError, "timeout waiting for uciok"):
                UciEngine(sys.executable, None, timeout=0.1)
        self.assertLess(time.monotonic() - start, 3)
        self.assertTrue(all(child.poll() is not None for child in children))


    def test_openings_are_legal_and_distinct(self) -> None:
        positions = set()
        for _, moves in OPENINGS:
            board = opening_board(moves)
            self.assertFalse(board.is_game_over())
            positions.add(board.fen())
        self.assertEqual(len(positions), len(OPENINGS))

    def test_balanced_elo_summary(self) -> None:
        summary = elo_summary([1.0, 0.0] * 10)
        self.assertEqual(summary["estimate"], 0.0)
        self.assertGreater(summary["uncertainty_95"], 0.0)

    def test_repository_opening_suite(self) -> None:
        path = Path(__file__).parents[1] / "test" / "openings.json"
        openings = load_openings(path)
        self.assertEqual(len(openings), 128)
        self.assertEqual(len({item["fen"] for item in openings}), 128)

    def test_small_match_rejects_elo_estimate(self) -> None:
        with self.assertRaisesRegex(ValueError, "at least 20 games"):
            run_match(
                "engine_a",
                "model_a",
                "engine_b",
                "model_b",
                depth=1,
                max_plies=1,
                opening_count=1,
                estimate_elo=True,
            )


if __name__ == "__main__":
    unittest.main()
