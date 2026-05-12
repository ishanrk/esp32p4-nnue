from __future__ import annotations

import unittest
from pathlib import Path

from arena import OPENINGS, elo_summary, load_openings, opening_board, run_match


class ArenaTest(unittest.TestCase):
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
