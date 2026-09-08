"""Bounded diagnostic evaluation of existing data. Does not train or select a model."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import torch
from data import load_dataset_manifest, dataset_profile, split_shard_paths, load_shard
from net import NnueNetwork


def metrics(target, prediction):
    target, prediction = np.asarray(target), np.asarray(prediction)
    if not len(target):
        return {"count": 0, "mae_cp": None, "sign_agreement": None}
    return {"count": len(target), "mae_cp": float(np.abs(prediction - target).mean()),
            "sign_agreement": float((np.sign(prediction) == np.sign(target)).mean())}


def feature_key(side, opponent):
    # Sort each perspective separately. Feature sums are order independent.
    return hashlib.sha256(np.concatenate((np.sort(side), np.sort(opponent))).astype("<u2").tobytes()).digest()


def analyze(dataset, checkpoint, limit=20000, seed=7):
    manifest, directory = load_dataset_manifest(dataset)
    profile = dataset_profile(manifest)
    torch.set_num_threads(2)
    net = NnueNetwork(profile)
    net.load_state_dict(torch.load(checkpoint, map_location="cpu", weights_only=True))
    net.eval()
    keys, splits = {}, {}
    rng = np.random.default_rng(seed)
    for split in ("train", "validation", "test"):
        targets, predictions, piece_counts, digests = [], [], [], []
        paths = split_shard_paths(manifest, directory, split)
        remaining = limit
        for path_index, path in enumerate(paths):
            side, opponent, score = load_shard(path, profile)
            count = min(len(score), max(0, remaining // (len(paths) - path_index)))
            indexes = np.sort(rng.choice(len(score), count, replace=False))
            remaining -= count
            side, opponent, score = side[indexes], opponent[indexes], score[indexes]
            targets.extend(score.astype(float).tolist())
            piece_counts.extend((side < profile.padding_feature).sum(axis=1).tolist())
            digests.extend(feature_key(a,b) for a,b in zip(side,opponent))
            with torch.inference_mode():
                for offset in range(0, count, 1024):
                    prediction = net(torch.from_numpy(side[offset:offset+1024].astype(np.int64)),
                                     torch.from_numpy(opponent[offset:offset+1024].astype(np.int64)))
                    predictions.extend(prediction.numpy().tolist())
        target, prediction, pieces = np.asarray(targets), np.asarray(predictions), np.asarray(piece_counts)
        groups = {"all": np.ones(len(target), dtype=bool),
                  "abs_label_below_30000": np.abs(target) < 30000,
                  "abs_label_at_30000": np.abs(target) == 30000,
                  "abs_label_below_100": np.abs(target) < 100,
                  "abs_label_100_to_999": (np.abs(target) >= 100) & (np.abs(target) < 1000),
                  "abs_label_1000_to_9999": (np.abs(target) >= 1000) & (np.abs(target) < 10000),
                  "abs_label_10000_to_29999": (np.abs(target) >= 10000) & (np.abs(target) < 30000),
                  "nonking_pieces_at_most_10": pieces <= 10,
                  "nonking_pieces_11_to_20": (pieces > 10) & (pieces <= 20),
                  "nonking_pieces_above_20": pieces > 20}
        report = {name: metrics(target[mask], prediction[mask]) for name,mask in groups.items()}
        report["duplicate_feature_inputs_in_sample"] = len(digests) - len(set(digests))
        total_error = np.abs(target-prediction).sum()
        report["absolute_error_fraction_from_30000_labels"] = float(np.abs(target-prediction)[groups["abs_label_at_30000"]].sum() / total_error) if total_error else 0
        keys[split], splits[split] = set(digests), report
    overlaps = {f"{a}_with_{b}": len(keys[a] & keys[b]) for a,b in [("train","validation"),("train","test"),("validation","test")]}
    return {"execution":"host diagnostic sample", "seed":seed, "limit_per_split":limit,
            "checkpoint_sha256":hashlib.sha256(Path(checkpoint).read_bytes()).hexdigest(),
            "dataset_manifest_sha256":hashlib.sha256((directory/"manifest.json").read_bytes()).hexdigest(),
            "model_selection_performed":False, "splits":splits,"sample_feature_overlaps":overlaps,
            "limitations":["Labels at 30000 combine encoded mates and clipped extreme scores. Original mate flags were not retained in these shards.",
                            "Feature equivalence is not exact FEN or game identity. Castling and move counters are absent from the network input.",
                            "Piece count is a phase proxy, not a recorded game phase.",
                            "No overlap in a sample cannot establish absence of leakage in the full dataset.",
                            "This diagnostic revisits existing evaluation data. It is not a fresh untouched test or strength estimate."]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset"); parser.add_argument("checkpoint")
    parser.add_argument("--limit",type=int,default=20000)
    parser.add_argument("--output",required=True)
    args = parser.parse_args()
    if args.limit < 1: parser.error("limit must be positive")
    report = analyze(args.dataset,args.checkpoint,args.limit)
    Path(args.output).write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps({"test":report["splits"]["test"],"overlaps":report["sample_feature_overlaps"]},indent=2))


if __name__ == "__main__": main()
