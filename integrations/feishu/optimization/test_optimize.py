import unittest
from types import SimpleNamespace

from optimize import IncidentBatchSampler, REPO, candidate_pool, output_path, select_candidate


def training(key, kind="extraction"):
    return {"id": key, "kind": kind, "split": "train"}


class Adapter:
    def __init__(self, predicted, cached=()):
        self.predicted = predicted
        self.cache = {key: {"score": predicted[key]} for key in cached}
        self.model_evaluations = 0

    def evaluate_one(self, row, candidate):
        key = row["id"], candidate[row["kind"]]
        if key not in self.cache:
            self.model_evaluations += 1
            self.cache[key] = {"score": self.predicted[key]}
        return self.cache[key]


class CandidateSelectionTest(unittest.TestCase):
    def test_feedback_sampler_rotates_evidence_and_never_samples_outside_training(self):
        rows = [{"group": name} for name in ("old", "feedback-a", "old2", "feedback-b")]
        loader = SimpleNamespace(all_ids=lambda: range(len(rows)))
        sampler = IncidentBatchSampler(rows, 3, 42)
        batches = [sampler.next_minibatch_ids(loader, None) for _ in range(4)]
        self.assertEqual({batch[0] for batch in batches[:2]}, {1, 3})
        self.assertTrue(all(len(set(batch)) == 3 and set(batch) <= set(range(4)) for batch in batches))

    def test_validation_tie_uses_changed_component_on_common_rows(self):
        candidates = [
            {"extraction": "A", "chat": "C"}, {"extraction": "long B", "chat": "C"},
            {"extraction": "ignored", "chat": ""},
        ]
        result = SimpleNamespace(candidates=candidates, val_aggregate_scores=[1, 1, 0.8], total_metric_calls=9)
        predictions = {("one", "A"): 0.5, ("one", "long B"): 1, ("two", "A"): 1, ("two", "long B"): 1}
        adapter = Adapter(predictions, cached=[("one", "A")])
        selected, tie = select_candidate(result, adapter, [training("one"), training("two"), training("three", "chat")], 12, 42)
        self.assertEqual(selected, 1)
        self.assertCountEqual(tie["paired_train_ids"], ["one", "two"])
        self.assertEqual(tie["differing_components"], ["extraction"])
        self.assertEqual(tie["train_means"], {0: 0.75, 1: 1})
        self.assertEqual(tie["extra_evaluations"], 3)

    def test_partial_budget_shares_component_and_favors_shorter_on_further_tie(self):
        candidates = [
            {"extraction": "A", "chat": "long"}, {"extraction": "B", "chat": "long"},
            {"extraction": "B", "chat": "c"},
        ]
        result = SimpleNamespace(candidates=candidates, val_aggregate_scores=[1, 1, 1], total_metric_calls=9)
        adapter = Adapter({("one", "A"): 0.5, ("one", "B"): 1}, cached=[("one", "A")])
        selected, tie = select_candidate(result, adapter, [training("two", "chat"), training("one")], 10, 42)
        self.assertEqual((selected, tie["paired_train_ids"], tie["extra_evaluations"]), (2, ["one"], 1))
        # No evaluation for either candidate if a complete comparison cannot fit.
        selected, tie = select_candidate(result, adapter, [training("unseen", "chat")], 10, 42)
        self.assertEqual((selected, tie["paired_train_ids"], tie["extra_evaluations"]), (2, [], 0))

    def test_unique_val_winner_uses_no_train_calls_and_rejects_holdout(self):
        result = SimpleNamespace(candidates=[{"extraction": "", "chat": ""}, {"extraction": "long", "chat": ""}],
                                 val_aggregate_scores=[0.9, 1], total_metric_calls=5)
        adapter = Adapter({})
        selected, tie = select_candidate(result, adapter, [training("one")], 20, 42)
        self.assertEqual((selected, tie["extra_evaluations"]), (1, 0))
        with self.assertRaisesRegex(ValueError, "training examples"):
            select_candidate(result, adapter, [dict(training("isolated"), split="holdout")], 20, 42)

    def test_pool_keeps_gepa_candidates_and_named_validation_scores_separate_from_selection(self):
        candidate = {"extraction": "a", "chat": "b"}
        result = SimpleNamespace(candidates=[candidate, candidate], val_aggregate_scores=[1, 1], parents=[[None], [0]],
                                 val_subscores=[{0: 1}, {0: 1}], best_idx=0)
        pool = candidate_pool(result, [{"id": "v"}], 1, {})
        self.assertEqual((pool["gepa_best_index"], pool["selected_index"]), (0, 1))
        self.assertEqual(pool["candidates"][1], {"index": 1, "parents": [0], "candidate": candidate,
                                                "validation_mean": 1, "validation_scores": {"v": 1}})
        dest = REPO / "build/feishu-optimization/winner.json"
        for path in (dest, REPO / "integrations/feishu/active-prompt.json", REPO / "build/feishu/feishu-bindings.json"):
            with self.assertRaises(ValueError):
                output_path(path, (dest,))


if __name__ == "__main__":
    unittest.main()
