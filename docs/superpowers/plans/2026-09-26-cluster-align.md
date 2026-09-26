# 去重聚簇与实体对齐实施计划（WP-A5）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 回填 cluster_id/cluster_first，规则对齐实体并落表，产出抽样与报表脚本。规格：`docs/superpowers/specs/2026-09-26-cluster-align-design.md`。

### Task 1 normalize + minhash（TDD，纯函数）— RED → GREEN → 提交
### Task 2 assignClusters（TDD，纯函数）— RED → GREEN → 提交
### Task 3 迁移 `research_source_entity_alignments` + 真库测试 — RED → GREEN → 提交
### Task 4 align.ts（TDD，纯函数）— RED → GREEN → 提交
### Task 5 run.ts（mock ctx：runCluster/runAlign 写回、幂等）— RED → GREEN → 提交
### Task 6 scripts（cluster、sample、report）+ report 纯函数测试 — 提交
### Task 7 全量验证、Codex 评审、PR（base `codex/wp-a6-controlled-copies`）
