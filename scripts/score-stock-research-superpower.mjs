#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function readJson(file) {
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw);
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
}

function validateBenchmark(benchmark) {
  const errors = [];
  if (benchmark.schema_version !== "1.0") {
    errors.push("schema_version must be 1.0");
  }
  if (benchmark.skill !== "stock-research-superpower") {
    errors.push("skill must be stock-research-superpower");
  }
  if (!Number.isFinite(benchmark.passing_score) || benchmark.passing_score <= 0) {
    errors.push("passing_score must be a positive number");
  }
  if (!Number.isFinite(benchmark.excellent_score) || benchmark.excellent_score < benchmark.passing_score) {
    errors.push("excellent_score must be >= passing_score");
  }

  try {
    assertArray(benchmark.rubric, "rubric");
  } catch (error) {
    errors.push(error.message);
  }

  const rubricIds = new Set();
  let totalWeight = 0;
  for (const item of benchmark.rubric || []) {
    if (!item.id) errors.push("rubric item missing id");
    if (rubricIds.has(item.id)) errors.push(`duplicate rubric id: ${item.id}`);
    rubricIds.add(item.id);
    if (!Number.isFinite(item.weight) || item.weight <= 0) {
      errors.push(`rubric ${item.id || "<missing>"} has invalid weight`);
    } else {
      totalWeight += item.weight;
    }
  }
  if (totalWeight !== 100) {
    errors.push(`rubric weights must sum to 100, got ${totalWeight}`);
  }

  try {
    assertArray(benchmark.cases, "cases");
  } catch (error) {
    errors.push(error.message);
  }

  const caseIds = new Set();
  const workflows = new Set(["A", "B", "C", "D"]);
  for (const testCase of benchmark.cases || []) {
    if (!testCase.id) errors.push("case missing id");
    if (caseIds.has(testCase.id)) errors.push(`duplicate case id: ${testCase.id}`);
    caseIds.add(testCase.id);
    if (!workflows.has(testCase.workflow)) errors.push(`case ${testCase.id} has invalid workflow`);
    if (!testCase.prompt) errors.push(`case ${testCase.id} missing prompt`);
    if (!testCase.expected_route) errors.push(`case ${testCase.id} missing expected_route`);
    for (const field of ["must_include", "must_not_include"]) {
      if (!Array.isArray(testCase[field]) || testCase[field].length === 0) {
        errors.push(`case ${testCase.id} ${field} must be a non-empty array`);
      }
    }
    if (!testCase.scoring_hints || typeof testCase.scoring_hints !== "object") {
      errors.push(`case ${testCase.id} missing scoring_hints`);
    } else {
      for (const rubricId of rubricIds) {
        if (!Array.isArray(testCase.scoring_hints[rubricId]) || testCase.scoring_hints[rubricId].length === 0) {
          errors.push(`case ${testCase.id} missing scoring_hints.${rubricId}`);
        }
      }
    }
  }

  return errors;
}

function countMatches(text, phrases) {
  const normalized = text.toLowerCase();
  return phrases.filter((phrase) => normalized.includes(String(phrase).toLowerCase()));
}

function scoreAnswer(benchmark, testCase, answerText) {
  const forbiddenHits = countMatches(answerText, testCase.must_not_include);
  const mustHits = countMatches(answerText, testCase.must_include);
  const mustIncludeScore = testCase.must_include.length === 0
    ? 1
    : mustHits.length / testCase.must_include.length;

  const rubricScores = {};
  for (const item of benchmark.rubric) {
    const hints = testCase.scoring_hints[item.id] || [];
    const hits = countMatches(answerText, hints);
    const hintRatio = hints.length === 0 ? 0 : hits.length / hints.length;
    let ratio = hintRatio;
    if (item.id === "structure") {
      ratio = (hintRatio + mustIncludeScore) / 2;
    }
    if (item.id === "guardrails" && forbiddenHits.length > 0) {
      ratio = 0;
    }
    rubricScores[item.id] = {
      label: item.label,
      weight: item.weight,
      hits,
      possible: hints.length,
      points: Math.round(item.weight * Math.min(1, ratio) * 100) / 100
    };
  }

  const total = Object.values(rubricScores).reduce((sum, item) => sum + item.points, 0);
  return {
    case_id: testCase.id,
    workflow: testCase.workflow,
    score: Math.round(total * 100) / 100,
    passing_score: benchmark.passing_score,
    passed: total >= benchmark.passing_score && forbiddenHits.length === 0,
    forbidden_hits: forbiddenHits,
    required_hits: mustHits,
    required_missing: testCase.must_include.filter((phrase) => !mustHits.includes(phrase)),
    rubric: rubricScores
  };
}

function printSelfCheck(benchmark, errors) {
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    fail(`benchmark self-check failed with ${errors.length} error(s)`);
    return;
  }
  console.log(JSON.stringify({
    ok: true,
    skill: benchmark.skill,
    cases: benchmark.cases.length,
    rubric_items: benchmark.rubric.length,
    total_weight: benchmark.rubric.reduce((sum, item) => sum + item.weight, 0),
    passing_score: benchmark.passing_score,
    excellent_score: benchmark.excellent_score
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.benchmark) {
    fail("missing --benchmark <path>");
    return;
  }

  const benchmarkPath = path.resolve(args.benchmark);
  const benchmark = readJson(benchmarkPath);
  const errors = validateBenchmark(benchmark);

  if (args["self-check"]) {
    printSelfCheck(benchmark, errors);
    return;
  }

  if (errors.length > 0) {
    printSelfCheck(benchmark, errors);
    return;
  }

  if (!args.case || !args.answer) {
    fail("scoring requires --case <id> and --answer <path>");
    return;
  }

  const testCase = benchmark.cases.find((item) => item.id === args.case);
  if (!testCase) {
    fail(`unknown case: ${args.case}`);
    return;
  }

  const answerText = fs.readFileSync(path.resolve(args.answer), "utf8");
  const result = scoreAnswer(benchmark, testCase, answerText);
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) {
    process.exitCode = 1;
  }
}

main();
