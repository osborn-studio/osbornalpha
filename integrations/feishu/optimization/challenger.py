"""Freeze one genuinely changed GEPA component for independent testing."""

import argparse
from contextlib import ExitStack
import hashlib
import json
import math
import os
from pathlib import Path
import sys

from optimize import candidate_error, output_path


COMPONENTS = ("extraction", "chat")


def fingerprint(prompt):
    ordered = {key: prompt[key] for key in COMPONENTS}
    compact = json.dumps(ordered, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(compact.encode("utf-8")).hexdigest()


def metric(value):
    if type(value) not in (float, int) or not 0 <= value <= 1:
        raise ValueError("invalid development metric")
    return value


def select_challenger(pool, baseline, component):
    if component not in COMPONENTS or candidate_error(baseline):
        raise ValueError("invalid baseline or component")
    if not isinstance(pool, dict) or pool.get("schema_version") != 1:
        raise ValueError("expected a GEPA pool from optimize.py")
    candidates = pool.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise ValueError("empty GEPA pool")

    other = next(key for key in COMPONENTS if key != component)
    validation_ids = None
    for i, entry in enumerate(candidates):
        if not isinstance(entry, dict) or type(entry.get("index")) is not int or entry["index"] != i:
            raise ValueError("GEPA candidate indices must be contiguous")
        prompt = entry.get("candidate")
        if error := candidate_error(prompt):
            raise ValueError(error)
        parents = entry.get("parents")
        if i == 0:
            if parents != [None] or prompt != baseline:
                raise ValueError("the pool seed must match the supplied baseline")
        elif not isinstance(parents, list) or not parents or any(type(p) is not int or not 0 <= p < i for p in parents):
            raise ValueError("each GEPA mutation needs a valid parent chain to the seed")
        if prompt[other] != baseline[other]:
            raise ValueError("mixed component pool: rerun a single-component search; projected scores are unavailable")
        scores = entry.get("validation_scores")
        if not isinstance(scores, dict) or not scores or any(not isinstance(k, str) or not k for k in scores):
            raise ValueError("missing per-example validation scores")
        if validation_ids is not None and scores.keys() != validation_ids:
            raise ValueError("validation coverage differs between candidates")
        validation_ids = scores.keys()
        mean = sum(metric(s) for s in scores.values()) / len(scores)
        if not math.isclose(mean, metric(entry.get("validation_mean")), rel_tol=0, abs_tol=1e-9):
            raise ValueError("aggregate validation score conflicts with per-example scores")

    eligible = [entry for entry in candidates[1:] if entry["candidate"][component].strip() != baseline[component].strip()]
    if not eligible:
        raise ValueError("no GEPA-generated change to the requested component; no challenger written")
    high = max(entry["validation_mean"] for entry in eligible)
    leaders = [entry for entry in eligible if math.isclose(entry["validation_mean"], high, rel_tol=0, abs_tol=1e-12)]
    tie = pool.get("tie_break", {})
    if not isinstance(tie, dict):
        raise ValueError("invalid tie-break metadata")
    train_ids = tie.get("paired_train_ids", [])
    means = tie.get("train_means", {})
    tied_indices = tie.get("tied_validation_indices", [])
    if not isinstance(train_ids, list) or any(not isinstance(k, str) or not k for k in train_ids) or len(set(train_ids)) != len(train_ids):
        raise ValueError("invalid paired training ids")
    if set(train_ids).intersection(validation_ids):
        raise ValueError("training tie-break overlaps validation")
    if not isinstance(means, dict) or not isinstance(tied_indices, list):
        raise ValueError("invalid training tie-break")
    use_training = len(leaders) > 1 and bool(train_ids) and tie.get("differing_components") == [component] and all(
        e["index"] in tied_indices and means.get(str(e["index"])) is not None for e in leaders)
    if use_training:
        best_train = max(metric(means[str(e["index"])]) for e in leaders)
        leaders = [e for e in leaders if math.isclose(means[str(e["index"])], best_train, rel_tol=0, abs_tol=1e-12)]
    winner = min(leaders, key=lambda e: (len(e["candidate"][component]), e["index"]))
    out = dict(baseline)
    out[component] = winner["candidate"][component]
    pending = list(winner["parents"])
    ancestors = set()
    while pending:
        idx = pending.pop()
        if idx not in ancestors:
            ancestors.add(idx)
            pending.extend(p for p in candidates[idx]["parents"] if p is not None)
    report = {
        "schema_version": 1, "source": "GEPA development pool", "component": component, "candidate_index": winner["index"],
        "parents": winner["parents"], "ancestor_indices": sorted(ancestors),
        "baseline_hash": fingerprint(baseline), "candidate_hash": fingerprint(out),
        "hash_encoding": "sha256 UTF-8 compact JSON; extraction then chat",
        "unchanged_component": other, "validation_examples": len(validation_ids),
        "baseline_validation_mean": candidates[0]["validation_mean"], "candidate_validation_mean": winner["validation_mean"],
        "training_tie_break_used": use_training, "paired_training_examples": len(train_ids) if use_training else 0,
        "training_tie_break_mean": means[str(winner["index"])] if use_training else None,
    }
    return out, report


def write_pair(outputs):
    # Create fresh files and remove only our own partial output if the second write fails.
    with ExitStack() as rollback:
        for path, value in outputs:
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, "x", encoding="utf-8", opener=lambda name, flags: os.open(name, flags, 0o600)) as stream:
                rollback.callback(path.unlink, missing_ok=True)
                json.dump(value, stream, ensure_ascii=False, indent=2)
                stream.write("\n")
        rollback.pop_all()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pool", required=True, type=Path)
    parser.add_argument("--baseline", required=True, type=Path)
    parser.add_argument("--component", required=True, choices=COMPONENTS)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--provenance", required=True, type=Path)
    args = parser.parse_args()
    dest = output_path(args.output, (args.pool, args.baseline))
    provenance = output_path(args.provenance, (args.pool, args.baseline, dest))
    raw_pool = args.pool.read_bytes()
    candidate, report = select_challenger(json.loads(raw_pool), json.loads(args.baseline.read_text(encoding="utf-8")), args.component)
    report["pool_sha256"] = hashlib.sha256(raw_pool).hexdigest()
    write_pair([(dest, candidate), (provenance, report)])
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as error:
        sys.exit(str(error))
