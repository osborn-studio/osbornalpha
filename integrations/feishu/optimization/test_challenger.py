import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from challenger import fingerprint, select_challenger


BASE = {"extraction": "", "chat": "在呢。"}


def pool(texts=("", "长一点的改写", "短"), scores=(1, .8, .8)):
    return {"schema_version": 1, "gepa_best_index": 0, "selected_index": 0, "tie_break": {}, "candidates": [
        {"index": i, "parents": [i-1] if i else [None], "candidate": {**BASE, "extraction": text},
         "validation_mean": score, "validation_scores": {"v": score}}
        for i, (text, score) in enumerate(zip(texts, scores))]}


def choose(p):
    return select_challenger(p, BASE, "extraction")


class ChallengerTest(unittest.TestCase):
    def test_freezes_only_genuine_mutation_even_if_seed_wins_development(self):
        candidate, report = choose(pool())
        self.assertEqual(candidate, {"extraction": "短", "chat": BASE["chat"]})
        self.assertEqual((report["candidate_index"], report["parents"], report["ancestor_indices"]), (2, [1], [0, 1]))
        self.assertEqual(report["baseline_validation_mean"], 1)
        compact = '{"extraction":"短","chat":"在呢。"}'.encode()
        self.assertEqual(report["candidate_hash"], hashlib.sha256(compact).hexdigest())
        self.assertEqual(report["baseline_hash"], fingerprint(BASE))
        self.assertEqual(choose(pool(scores=(1, 1, .9)))[1]["candidate_index"], 1)
        self.assertEqual(choose(pool(texts=("", "甲", "乙")))[1]["candidate_index"], 1)

    def test_only_common_paired_training_scores_can_break_tie(self):
        p = pool(scores=(.6, 1, 1))
        p["tie_break"] = {"tied_validation_indices": [1, 2], "differing_components": ["extraction"],
                          "paired_train_ids": ["t"], "train_means": {"1": 1, "2": .5}}
        self.assertEqual(choose(p)[1]["candidate_index"], 1)
        self.assertTrue(choose(p)[1]["training_tie_break_used"])
        del p["tie_break"]["train_means"]["2"]
        self.assertEqual(choose(p)[1]["candidate_index"], 2)
        self.assertFalse(choose(p)[1]["training_tie_break_used"])
        p["tie_break"]["paired_train_ids"] = ["v"]
        with self.assertRaisesRegex(ValueError, "overlaps"):
            choose(p)

    def test_rejects_ungrounded_seed_mixed_components_lineage_and_metrics(self):
        variants = [
            (0, {"candidate": {**BASE, "extraction": "别的起点"}}, "baseline"),
            (1, {"candidate": {"extraction": "有效", "chat": "变了"}}, "mixed"),
            (1, {"parents": [1]}, "parent"), (1, {"parents": []}, "parent"),
            (2, {"index": 3}, "indices"), (2, {"validation_scores": {"v2": .8}}, "coverage"),
            (2, {"validation_mean": .2}, "conflicts"), (2, {"validation_mean": float("nan")}, "invalid"),
        ]
        for index, change, message in variants:
            with self.subTest(index=index, change=change):
                p = pool()
                p["candidates"][index].update(change)
                with self.assertRaisesRegex(ValueError, message):
                    choose(p)
        with self.assertRaisesRegex(ValueError, "no GEPA-generated"):
            choose(pool(("", " "), (1, 1)))

    def test_cli_preserves_existing_outputs_and_rejects_source_path(self):
        script = Path(__file__).with_name("challenger.py")
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            baseline, source, out, provenance = [base / name for name in ("base.json", "pool.json", "out.json", "report.json")]
            baseline.write_text(json.dumps(BASE))
            source.write_text(json.dumps(pool()))

            def run(dest=out, report=provenance):
                return subprocess.run([sys.executable, str(script), "--pool", str(source), "--baseline", str(baseline),
                                       "--component", "extraction", "--output", str(dest), "--provenance", str(report)],
                                      capture_output=True, text=True)

            self.assertEqual(run(script).returncode, 1)
            self.assertEqual(run(baseline).returncode, 1)
            provenance.write_text("keep")
            self.assertEqual(run().returncode, 1)
            self.assertEqual(provenance.read_text(), "keep")
            self.assertFalse(out.exists())
            provenance.unlink()
            self.assertEqual(run().returncode, 0)
            self.assertEqual(json.loads(out.read_text())["extraction"], "短")
            self.assertEqual(json.loads(provenance.read_text())["pool_sha256"], hashlib.sha256(source.read_bytes()).hexdigest())
            self.assertNotEqual(run().returncode, 0)


if __name__ == "__main__":
    unittest.main()
