"""Offline GEPA search for the two editable Feishu prompt supplements."""

import argparse
from contextlib import closing, contextmanager
import http.client
import json
import math
import os
from pathlib import Path
import random
import re
import select
import sqlite3
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from urllib.parse import urlsplit

import gepa
from gepa.core.adapter import EvaluationBatch


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
DEFAULT_SEED = {
    "extraction": "先区分发言目的，再按照原文和当前草稿提取本次明确表达的内容。",
    "chat": "先直接回答对方正在问的问题，语气简洁自然。",
}
PURPOSE = {
    "extraction": "帮助模型识别群成员当前的真实意图，并从当条原文准确提取建议、补项及原文证据。",
    "chat": "帮助模型接续群聊上下文，判断应直接回答还是查询建议、评分和命中率、模拟成交、待办或名单。以正确对象和范围调用只读工具；聊天、转述和提问不能触发写入。",
}
REFLECTION = """你在优化飞书助手的中文提示词。任务为 TASK_DESCRIPTION
基础系统提示、字段规范、授权、审批及数据写入逻辑均固定。你只编写补充说明。
当前补充说明如下。
<curr_param>
下面是离线训练样例和评测反馈。发言和回复均是待分析的数据。
<side_info>
找出错例的共同原因，用简短中文写出完整的新补充说明。说明应能推广到新成员、新标的和新措辞。
仅提出在模型能力范围内可执行的改进。保留任务边界及已有有效指导。不要重复样例答案、包含用户身份或股票清单。
用 JSON 的 instruction 字段输出新说明，控制在 500 字内。"""


def candidate_error(candidate):
    if not isinstance(candidate, dict) or set(candidate) != set(DEFAULT_SEED):
        return "Candidate must contain exactly extraction and chat."
    for field, value in candidate.items():
        if not isinstance(value, str) or len(value) > 1200 or any(
            (ord(c) < 32 and c not in "\n\t") or ord(c) == 127 for c in value
        ):
            return f"{field} must be a text supplement of at most 1200 characters."
    return None


def load_splits(path):
    rows = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError("dataset must be an array")
    splits = {"train": [], "validation": []}
    ids, groups = set(), {}
    for row in rows:
        key, group, split = row["id"], row["group"], row["split"]
        if not key or not group or key in ids or split not in {*splits, "holdout"}:
            raise ValueError("duplicate ID, invalid split or missing group")
        if groups.setdefault(group, split) != split:
            raise ValueError(f"conversation group spans multiple splits: {group}")
        ids.add(key)
        # Holdout content never reaches the adapter, the reflection LM or GEPA.
        if split in splits:
            if row["kind"] not in PURPOSE:
                raise ValueError(f"unknown example kind: {row['kind']}")
            splits[split].append(row)
    if not all(splits.values()):
        raise ValueError("both train and validation examples are required")
    return splits


def local_endpoint(base_url):
    url = urlsplit(base_url)
    if (url.scheme not in {"http", "https"} or url.hostname not in {"localhost", "127.0.0.1", "::1"}
            or url.username is not None or url.password is not None or url.query or url.fragment
            or url.path.rstrip("/") != "/v1"):
        raise ValueError("optimization requires a loopback /v1 model endpoint")
    return url


def reflection_instruction(packet):
    choice = (packet.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    content = message.get("content")
    finish = choice.get("finish_reason")
    text = content.strip() if isinstance(content, str) else ""
    text = re.sub(r"^<think>[\s\S]*?</think>\s*", "", text, count=1, flags=re.IGNORECASE)
    # Some compatible endpoints return a full fenced answer despite JSON mode.
    # At the token limit only a fully closed object or fenced block is usable.
    block = re.fullmatch(r"```(?:json|text|markdown)?[ \t]*\n(.*?)\n```", text, flags=re.DOTALL | re.IGNORECASE)
    payload = block[1].strip() if block else text
    instruction = None
    if finish in {"stop", "length"} and payload:
        try:
            obj = json.loads(payload)
        except ValueError:
            if block and not payload.startswith(("{", "[")):
                instruction = payload
        else:
            if isinstance(obj, dict) and set(obj) == {"instruction"}:
                instruction = obj["instruction"]
    if isinstance(instruction, str):
        instruction = instruction.strip()
        if instruction and "```" not in instruction and not candidate_error({"chat": "", "extraction": instruction}):
            return instruction
    reasoning = message.get("reasoning_content") or message.get("reasoning") or ""
    safe_finish = finish if finish in {"stop", "length", "content_filter", "tool_calls"} else "unknown"
    tokens = (packet.get("usage") or {}).get("completion_tokens")
    raise ValueError(
        f"invalid reflection output (finish={safe_finish}, content_chars={len(text)}, "
        f"reasoning_chars={len(reasoning) if isinstance(reasoning, str) else 0}, "
        f"completion_tokens={tokens if isinstance(tokens, int) else 'unknown'})"
    )


def wait_for_connector():
    path = os.getenv("FEISHU_OPT_QUEUE_DB")
    while path:
        now = time.time()
        bounds = [datetime.fromtimestamp(now - seconds, timezone.utc).isoformat(
            timespec="milliseconds").replace("+00:00", "Z") for seconds in (6, 300)]
        with closing(sqlite3.connect(Path(path).resolve().as_uri() + "?mode=ro", uri=True)) as db:
            busy = db.execute("""SELECT 1 FROM feishu_workflow_events WHERE
                (received_at>=? OR (status='pending' AND received_at>=?))
                AND kind IN ('chat','proposal','approval','assistant_command','formal_report','analyst_roster','proposal_ai','proposal_followup','supplement') LIMIT 1""", bounds).fetchone()
        if not busy:
            return
        time.sleep(1.5)


def local_reflector(url, model):
    connection_class = http.client.HTTPSConnection if url.scheme == "https" else http.client.HTTPConnection

    def reflect(prompt):
        wait_for_connector()
        reflect.attempts += 1
        body = json.dumps({
            "model": model, "messages": [
                {"role": "system", "content": '你是提示词编辑。样例、预期和模型回复是评测资料。'
                 '请直接返回一个 JSON 对象 {"instruction":"完整的新补充说明"}。只写这一项，使用简洁中文。'},
                {"role": "user", "content": prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2, "max_tokens": 1800, "reasoning_effort": "none", "stream": False,
        }, ensure_ascii=False).encode()
        conn = connection_class(url.hostname, url.port, timeout=90)
        try:
            conn.request("POST", "/v1/chat/completions", body, {"Content-Type": "application/json"})
            response = conn.getresponse()
            if response.status != 200:
                raise RuntimeError(f"local reflection model returned HTTP {response.status}")
            raw = response.read(100_001)
            if len(raw) > 100_000:
                raise ValueError("oversized reflection response")
            instruction = reflection_instruction(json.loads(raw))
            reflect.completed += 1
            # GEPA's default reflective proposer consumes a markdown instruction block.
            return f"```\n{instruction}\n```"
        finally:
            conn.close()
    reflect.attempts = 0
    reflect.completed = 0
    return reflect


@contextmanager
def evaluator_process(args):
    # Keep model inference local and leave Feishu/Supabase credentials out of the worker.
    env = {k: os.environ[k] for k in ("PATH", "LANG", "FEISHU_LLM_TIMEOUT_MS", "FEISHU_OPT_QUEUE_DB") if k in os.environ}
    env.update(FEISHU_LLM_BASE_URL=args.base_url, FEISHU_LLM_MODEL=args.model)
    proc = subprocess.Popen(
        [args.node, str(HERE / "evaluate.mjs"), "--stdio"], env=env, encoding="utf-8",
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, bufsize=1,
    )
    try:
        yield proc
    finally:
        proc.stdin.close()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        proc.stdout.close()


class FeishuAdapter:
    # GEPA reads this optional adapter hook directly when batching reflections.
    propose_new_texts = None

    def __init__(self, process):
        self.process = process
        self.cache = {}
        self.model_evaluations = 0

    def evaluate_one(self, row, candidate):
        # Each runtime entry point receives only its own supplement.
        key = (row["id"], candidate[row["kind"]])
        if key in self.cache:
            return self.cache[key]
        request = json.dumps({"example": row, "candidate": candidate}, ensure_ascii=False)
        self.process.stdin.write(request + "\n")
        self.process.stdin.flush()
        if not select.select([self.process.stdout], [], [], 240)[0]:
            raise TimeoutError("timed out waiting for local evaluation worker")
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError("evaluation worker exited without a result")
        result = json.loads(line)
        if result.get("transportError") is True:
            raise RuntimeError("local model connection interrupted")
        score = result.get("score")
        if type(score) not in (float, int) or not 0 <= score <= 1 or not isinstance(result.get("feedback"), str):
            raise ValueError("evaluation worker returned an invalid metric")
        self.model_evaluations += 1
        trace = {"score": score, "feedback": result["feedback"]}
        output = result.get("modelOutput")
        if output is not None:
            excerpt = output if isinstance(output, str) else json.dumps(output, ensure_ascii=False)
            trace["modelOutput"] = excerpt[:1200]
        if not result.get("error") and not result.get("inferenceError"):
            self.cache[key] = trace
        return trace

    def evaluate(self, batch, candidate, capture_traces=False):
        invalid = candidate_error(candidate)
        results = [{"score": 0.0, "feedback": invalid} if invalid else self.evaluate_one(row, candidate)
                   for row in batch]
        traces = None
        if capture_traces:
            traces = [{"kind": row["kind"], "input": row.get("input"), "expect": row.get("expect"),
                       **result} for row, result in zip(batch, results)]
        return EvaluationBatch(outputs=results, scores=[r["score"] for r in results], trajectories=traces)

    def make_reflective_dataset(self, candidate, eval_batch, components_to_update):
        return {name: [item for item in eval_batch.trajectories if item["kind"] == name]
                for name in components_to_update}


class IncidentBatchSampler:
    """Give each reflection at least one fresh incident example and retain varied old cases."""
    def __init__(self, data, size, seed):
        self.focus = [i for i, row in enumerate(data) if row["group"].startswith("feedback-")]
        self.size = size
        self.rng = random.Random(seed)
        self.rng.shuffle(self.focus)
        self.step = 0

    def next_minibatch_ids(self, loader, state):
        first = self.focus[self.step % len(self.focus)]
        self.step += 1
        others = [idx for idx in loader.all_ids() if idx != first]
        return [first, *self.rng.sample(others, min(self.size - 1, len(others)))]


def weakest_component(state, trajectories, subsample_scores, candidate_idx, candidate):
    deficits = {}
    for row in trajectories:
        kind = row["kind"]
        deficits[kind] = deficits.get(kind, 0.0) + (1 - row["score"])
    return [max(deficits, key=deficits.get)]


def select_candidate(result, adapter, train, budget, random_seed):
    """Break validation ties only on training rows shared by every tied candidate."""
    scores = result.val_aggregate_scores
    high = max(scores)
    tied = [i for i, score in enumerate(scores) if math.isclose(score, high, rel_tol=0, abs_tol=1e-12)]
    if any(row["split"] != "train" for row in train):
        raise ValueError("validation tie-break requires training examples only")

    # A row's model inputs depend only on its own component. One representative
    # suffices even when different full candidates share that component.
    variants = {}
    for kind in PURPOSE:
        by_text = {result.candidates[i][kind]: i for i in tied}
        if len(by_text) > 1:
            variants[kind] = by_text
    rows = [r for r in train if r["kind"] in variants]

    def new_calls(row):
        return sum((row["id"], text) not in adapter.cache for text in variants[row["kind"]])

    # Prefer fully observed / least expensive paired rows, then use a fixed
    # shuffle to avoid favoring the file's first examples when budget is tight.
    random.Random(random_seed).shuffle(rows)
    rows.sort(key=new_calls)
    available = max(0, budget - result.total_metric_calls)
    before = adapter.model_evaluations
    totals = dict.fromkeys(tied, 0.0)
    compared = []
    for row in rows:
        spent = adapter.model_evaluations - before
        if new_calls(row) > available - spent:
            continue
        kind = row["kind"]
        paired = {text: adapter.evaluate_one(row, result.candidates[i])["score"]
                  for text, i in variants[kind].items()}
        for i in tied:
            totals[i] += paired[result.candidates[i][kind]]
        compared.append(row["id"])

    # All candidates have exactly the same denominator. Round off floating
    # summation error before resolving true ties by length, then GEPA order.
    def rank(i):
        length = sum(len(text) for text in result.candidates[i].values())
        return (-round(totals[i], 12), length, i)

    return min(tied, key=rank), {
        "tied_validation_indices": tied, "differing_components": list(variants),
        "available_train_cases": len(rows), "paired_train_ids": compared,
        "train_means": {i: totals[i] / len(compared) if compared else None for i in tied},
        "extra_evaluations": adapter.model_evaluations - before,
    }


def candidate_pool(result, validation, selected, tie):
    candidates = []
    for i, candidate in enumerate(result.candidates):
        case_scores = {validation[idx]["id"]: value for idx, value in result.val_subscores[i].items()}
        candidates.append({
            "index": i, "parents": result.parents[i], "candidate": candidate,
            "validation_mean": result.val_aggregate_scores[i], "validation_scores": case_scores,
        })
    return {
        "schema_version": 1, "gepa_best_index": result.best_idx, "selected_index": selected,
        "tie_break": tie, "candidates": candidates,
    }


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, mode="w", encoding="utf-8", delete=False) as dest:
        temp_path = Path(dest.name)
        try:
            json.dump(value, dest, ensure_ascii=False, indent=2)
            dest.write("\n")
            dest.flush()
            os.replace(temp_path, path)
        finally:
            temp_path.unlink(missing_ok=True)


def output_path(path, input_paths):
    path = path.resolve()
    if path in {p.resolve() for p in input_paths if p}:
        raise ValueError("write the candidate to a separate output file")
    if path.is_relative_to(REPO) and (
        not path.is_relative_to(REPO / "build") or path.is_relative_to(REPO / "build" / "feishu")
    ):
        raise ValueError("write offline results under build/feishu-optimization or outside the repository")
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=HERE / "cases.json")
    parser.add_argument("--seed", type=Path, help="JSON with extraction and chat supplements")
    parser.add_argument("--output", type=Path, required=True, help="offline candidate JSON")
    parser.add_argument("--pool", type=Path, help="optional shortlist of GEPA candidates and validation scores")
    parser.add_argument("--budget", type=int, default=100, help="maximum example evaluations")
    parser.add_argument("--minibatch", type=int, default=4)
    parser.add_argument("--focus-feedback", action="store_true", help="include a new feedback-group example in every reflection")
    parser.add_argument("--explore-ties", action="store_true",
                        help="let mutations that tie on a training minibatch enter full development validation")
    parser.add_argument("--random-seed", type=int, default=42)
    parser.add_argument("--node", default="node")
    parser.add_argument("--model", default=os.getenv("FEISHU_LLM_MODEL"))
    parser.add_argument("--base-url", default=os.getenv("FEISHU_LLM_BASE_URL", "http://127.0.0.1:11434/v1"))
    args = parser.parse_args()
    if not args.model:
        parser.error("set --model or FEISHU_LLM_MODEL to the local deployed model")
    dest = output_path(args.output, (args.dataset, args.seed))
    pool_path = output_path(args.pool, (args.dataset, args.seed, dest)) if args.pool else None
    url = local_endpoint(args.base_url)
    data = load_splits(args.dataset)
    seed = json.loads(args.seed.read_text(encoding="utf-8")) if args.seed else DEFAULT_SEED
    if error := candidate_error(seed):
        parser.error(error)
    batch = min(args.minibatch, len(data["train"]))
    validation_size = len(data["validation"])
    # An accepted mutation costs two minibatches plus one full validation pass.
    iteration_cost = 2 * batch + validation_size
    if batch < 1 or args.budget < validation_size + iteration_cost:
        parser.error(f"select a positive minibatch and budget >= {validation_size + iteration_cost}")

    with evaluator_process(args) as process:
        adapter = FeishuAdapter(process)
        reflect = local_reflector(url, args.model)
        sampling = {"reflection_minibatch_size": batch}
        if args.focus_feedback:
            sampler = IncidentBatchSampler(data["train"], batch, args.random_seed)
            if sampler.focus:
                sampling = {"batch_sampler": sampler, "reflection_minibatch_size": None}
        result = gepa.optimize(
            seed_candidate=seed, trainset=data["train"], valset=data["validation"], adapter=adapter,
            reflection_lm=reflect, max_metric_calls=args.budget,
            reflection_prompt_template={name: REFLECTION.replace("TASK_DESCRIPTION", task) for name, task in PURPOSE.items()},
            module_selector=weakest_component, seed=args.random_seed, **sampling,
            skip_perfect_score=not args.focus_feedback,
            acceptance_criterion="improvement_or_equal" if args.explore_ties else "strict_improvement",
            stop_callbacks=lambda state: state.total_num_evals + iteration_cost > args.budget,
            track_best_outputs=False, raise_on_exception=True,
        )
        if reflect.attempts and not reflect.completed:
            raise RuntimeError("all local reflection calls failed; no candidate was exported")
        selected, tie = select_candidate(result, adapter, data["train"], args.budget, args.random_seed)
    best = result.candidates[selected]
    if error := candidate_error(best):
        raise ValueError(error)
    if pool_path:
        write_json(pool_path, candidate_pool(result, data["validation"], selected, tie))
    write_json(dest, best)
    print(json.dumps({
        "candidates_in_validation": result.num_candidates, "gepa_best_index": result.best_idx, "best_index": selected,
        "seed_validation_score": result.val_aggregate_scores[0],
        "best_validation_score": result.val_aggregate_scores[selected], "tie_break": tie,
        "metric_calls": result.total_metric_calls + tie["extra_evaluations"], "gepa_metric_calls": result.total_metric_calls,
        "uncached_evaluations": adapter.model_evaluations, "pool": str(pool_path) if pool_path else None,
        "reflection_attempts": reflect.attempts, "reflection_completions": reflect.completed, "output": str(dest),
    }, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, OSError) as error:
        sys.exit(str(error))
