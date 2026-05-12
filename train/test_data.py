from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

import chess
import chess.pgn
import numpy as np

from data import (
    FEATURE_DTYPE,
    LABEL_DTYPE,
    SCORE_LIMIT,
    SPLITS,
    assign_game_split,
    dataset_profile,
    load_dataset_manifest,
    load_shard,
    split_shard_paths,
)
from features import MAX_ACTIVE_FEATURES, PADDING_FEATURE, encode_position
from import_evals import import_evaluations, parse_evaluation_record
from label import analyse_with_teacher, write_labeled_positions
from prep import prepare_dataset
from profiles import PROFILES


ROOT = Path(__file__).parents[1]
PGN_FIXTURE = ROOT / "test" / "training_games.pgn"
LABEL_FIXTURE = ROOT / "test" / "training_labels.jsonl"


class LabelingTest(unittest.TestCase):
    def test_lichess_evaluation_selection_and_perspective(self) -> None:
        white = parse_evaluation_record(
            {
                "fen": "7k/8/8/8/8/8/P7/K7 w - -",
                "evals": [
                    {"depth": 21, "knodes": 80, "pvs": [{"cp": 120}]},
                    {
                        "depth": 28,
                        "knodes": 400,
                        "pvs": [{"cp": 230}, {"cp": -900}],
                    },
                ],
            }
        )
        self.assertEqual(white.score, 230)
        self.assertEqual(white.depth, 28)
        self.assertEqual(white.knodes, 400)
        self.assertEqual(white.score_kind, "cp")

        black = parse_evaluation_record(
            {
                "fen": "7k/8/8/8/8/8/P7/K7 b - -",
                "evals": [
                    {"depth": 24, "pvs": [{"cp": 230}]},
                ],
            }
        )
        self.assertEqual(black.score, -230)

        black_mate = parse_evaluation_record(
            {
                "fen": "7k/8/8/8/8/8/P7/K7 b - -",
                "evals": [
                    {"depth": 30, "pvs": [{"mate": -4}]},
                ],
            }
        )
        self.assertEqual(black_mate.score, SCORE_LIMIT)
        self.assertEqual(black_mate.score_kind, "mate")

    def test_lichess_streaming_import_metadata(self) -> None:
        records = [
            {
                "fen": "7k/8/8/8/8/8/P7/K7 w - -",
                "evals": [
                    {"depth": 24, "knodes": 200, "pvs": [{"cp": 120}]}
                ],
            },
            {
                "fen": "7k/8/8/8/8/8/P7/K7 b - -",
                "evals": [
                    {"depth": 26, "knodes": 300, "pvs": [{"cp": -80}]}
                ],
            },
            {
                "fen": "7k/8/8/8/8/8/P7/K7 w - -",
                "evals": [
                    {"depth": 30, "knodes": 500, "pvs": [{"mate": 3}]}
                ],
            },
        ]
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            source = directory / "evals.jsonl"
            source.write_text(
                "".join(json.dumps(record) + "\n" for record in records),
                encoding="utf-8",
            )
            output = directory / "labels.jsonl"
            metadata = import_evaluations(
                str(source),
                output,
                limit=3,
                min_depth=20,
                selection_denominator=1,
                seed=7,
                validation_percent=33,
                test_percent=33,
            )
            self.assertEqual(metadata["records_scanned"], 3)
            self.assertEqual(metadata["accepted_records"], 3)
            self.assertEqual(
                metadata["evaluation_selection_rule"],
                "greatest depth and first principal variation",
            )
            prepared = prepare_dataset(
                output, directory / "prepared", shard_size=2
            )
            self.assertEqual(
                prepared["evaluation_import"]["records_scanned"], 3
            )

    def test_split_assignment_is_deterministic(self) -> None:
        first = [assign_game_split(game_id, 23) for game_id in range(200)]
        second = [assign_game_split(game_id, 23) for game_id in range(200)]
        self.assertEqual(first, second)
        self.assertEqual(set(first), set(SPLITS))

    def test_teacher_score_perspective_and_bound(self) -> None:
        class FakeEngine:
            def __init__(self, score) -> None:
                self.score = score
                self.limit = None

            def analyse(self, board, limit):
                self.limit = limit
                return {"score": self.score}

        board = chess.Board()
        board.push_san("e4")
        engine = FakeEngine(
            chess.engine.PovScore(chess.engine.Cp(42), chess.WHITE)
        )
        self.assertEqual(analyse_with_teacher(engine, board, 123), -42)
        self.assertEqual(engine.limit.nodes, 123)

        mate_engine = FakeEngine(
            chess.engine.PovScore(chess.engine.Mate(3), chess.BLACK)
        )
        mate_score = analyse_with_teacher(mate_engine, board, 50)
        self.assertGreater(mate_score, 0)
        self.assertLessEqual(mate_score, SCORE_LIMIT)

    def test_pgn_fixture_and_whole_game_splits(self) -> None:
        saw_black_start = False
        saw_castle = False
        saw_capture = False
        saw_promotion = False
        game_lengths = []
        with PGN_FIXTURE.open(encoding="utf-8") as source:
            while game := chess.pgn.read_game(source):
                self.assertFalse(game.errors)
                board = game.board()
                saw_black_start |= board.turn == chess.BLACK
                game_length = 0
                for move in game.mainline_moves():
                    saw_castle |= board.is_castling(move)
                    saw_capture |= board.is_capture(move)
                    saw_promotion |= move.promotion is not None
                    board.push(move)
                    game_length += 1
                game_lengths.append(game_length)
        self.assertEqual(len(game_lengths), 8)
        self.assertGreater(len(set(game_lengths)), 1)
        self.assertTrue(saw_black_start)
        self.assertTrue(saw_castle)
        self.assertTrue(saw_capture)
        self.assertTrue(saw_promotion)

        with tempfile.TemporaryDirectory() as temporary:
            first_path = Path(temporary) / "nested" / "first.jsonl"
            second_path = Path(temporary) / "second.jsonl"
            options = {
                "stride": 1,
                "limit": 1000,
                "min_ply": 1,
                "max_ply": None,
                "seed": 0,
                "validation_percent": 30,
                "test_percent": 30,
            }
            scorer = lambda board: 21 if board.turn == chess.WHITE else -21
            first_stats = write_labeled_positions(
                PGN_FIXTURE, first_path, scorer, **options
            )
            second_stats = write_labeled_positions(
                PGN_FIXTURE, second_path, scorer, **options
            )
            self.assertEqual(first_stats, second_stats)
            self.assertEqual(first_path.read_bytes(), second_path.read_bytes())
            records = [
                json.loads(line)
                for line in first_path.read_text(encoding="utf-8").splitlines()
            ]

        game_splits = {}
        for record in records:
            game_splits.setdefault(record["game_id"], record["split"])
            self.assertEqual(
                game_splits[record["game_id"]], record["split"]
            )
        self.assertEqual(set(game_splits.values()), set(SPLITS))
        self.assertEqual(
            first_stats["position_count"],
            sum(first_stats["split_counts"].values()),
        )
        self.assertEqual(
            {record["fen"].split()[1] for record in records}, {"w", "b"}
        )


class PreparationTest(unittest.TestCase):
    def test_profile_specific_shards(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            for profile in PROFILES:
                output = Path(temporary) / profile.name
                prepared = prepare_dataset(
                    LABEL_FIXTURE,
                    output,
                    shard_size=2,
                    profile=profile,
                )
                manifest, directory = load_dataset_manifest(output)
                self.assertEqual(dataset_profile(manifest), profile)
                self.assertEqual(
                    prepared["padding_feature"], profile.padding_feature
                )
                for split in SPLITS:
                    for path in split_shard_paths(manifest, directory, split):
                        side, opponent, _ = load_shard(path, profile)
                        self.assertTrue(
                            np.all(side <= profile.padding_feature)
                        )
                        self.assertTrue(
                            np.all(opponent <= profile.padding_feature)
                        )

    def test_compact_shards_and_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "data"
            manifest = prepare_dataset(
                LABEL_FIXTURE, output, shard_size=2
            )
            loaded_manifest, dataset_directory = load_dataset_manifest(output)
            self.assertEqual(manifest, loaded_manifest)
            self.assertEqual(
                manifest["split_counts"],
                {"train": 3, "validation": 2, "test": 2},
            )
            self.assertEqual(manifest["position_count"], 7)
            self.assertEqual(
                manifest["shard_counts"],
                {"train": 2, "validation": 1, "test": 1},
            )
            self.assertEqual(
                manifest["teacher_engine"]["name"], "fixture teacher"
            )
            self.assertEqual(manifest["teacher_node_budget"], 100)
            self.assertEqual(
                manifest["source"],
                {
                    "attribution": "esp32p4-nnue test fixture",
                    "description": (
                        "synthetic positions in test/training_labels.jsonl"
                    ),
                    "license": None,
                },
            )
            total_positions = 0
            labels = []
            training_sizes = []
            for split in SPLITS:
                paths = split_shard_paths(
                    manifest, dataset_directory, split
                )
                self.assertEqual(len(paths), manifest["shard_counts"][split])
                for path in paths:
                    with np.load(path, allow_pickle=False) as raw_shard:
                        self.assertEqual(
                            set(raw_shard.files), {"side", "opponent", "score"}
                        )
                    side, opponent, score = load_shard(path)
                    self.assertEqual(side.dtype, FEATURE_DTYPE)
                    self.assertEqual(opponent.dtype, FEATURE_DTYPE)
                    self.assertEqual(score.dtype, LABEL_DTYPE)
                    self.assertEqual(side.shape[1], MAX_ACTIVE_FEATURES)
                    self.assertLessEqual(len(score), 2)
                    total_positions += len(score)
                    labels.extend(score.tolist())
                    if split == "train":
                        training_sizes.append(len(score))
            self.assertEqual(training_sizes, [2, 1])
            self.assertEqual(total_positions, 7)
            self.assertIn(SCORE_LIMIT, labels)
            self.assertIn(-SCORE_LIMIT, labels)

            first_train = load_shard(output / "train_00000.npz")[0][0]
            self.assertEqual(
                int(np.count_nonzero(first_train == PADDING_FEATURE)), 29
            )

    def test_padding_and_malformed_fen(self) -> None:
        side, opponent = encode_position(
            "7k/8/8/8/8/8/P7/K7 w - - 0 1"
        )
        self.assertEqual(len(side), MAX_ACTIVE_FEATURES)
        self.assertEqual(len(opponent), MAX_ACTIVE_FEATURES)
        self.assertEqual(side.count(PADDING_FEATURE), 29)
        self.assertEqual(opponent.count(PADDING_FEATURE), 29)

        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "bad.jsonl"
            source.write_text(
                json.dumps(
                    {
                        "fen": "not a fen",
                        "game_id": 0,
                        "score": 0,
                        "split": "train",
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "bad fen"):
                prepare_dataset(source, Path(temporary) / "bad_data")

    def test_empty_data_and_cross_split_fail(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            temporary_path = Path(temporary)
            empty = temporary_path / "empty.jsonl"
            empty.write_text("", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "empty labeled data"):
                prepare_dataset(empty, temporary_path / "empty_data")

            crossed = temporary_path / "crossed.jsonl"
            fen = "7k/8/8/8/8/8/P7/K7 w - - 0 1"
            crossed.write_text(
                json.dumps(
                    {"fen": fen, "game_id": 0, "score": 0, "split": "train"}
                )
                + "\n"
                + json.dumps(
                    {
                        "fen": fen,
                        "game_id": 0,
                        "score": 0,
                        "split": "validation",
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "crosses dataset splits"):
                prepare_dataset(crossed, temporary_path / "crossed_data")


if __name__ == "__main__":
    unittest.main()
