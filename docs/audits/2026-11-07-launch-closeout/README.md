# 宏观工作台上线闭环记录（2026-11-07）

状态：**事实层已部署并通过登录态验收；用户目标是美林时钟四象限与判断能力上线，目前目标尚未完成。判断链路未通过，不能标记整体完成。**

## 最终发布处置

为保留可用宏观事实页面并隐藏未通过验收的判断入口，已删除生产 `MACRO_JUDGMENTS_ENABLED`，再次部署相同且 CI 通过的 `01308b44347421f061cc03cef36a0f172df41bc6`。最终部署 `dpl_DwaboWbskuigTUh2nJEqxwwmTpR8`，地址 `https://stock-monitor-oeyz3cjii-gilosbornhellos-projects.vercel.app`，READY 并 alias `osbornalpha.com`；`MACRO_STRATEGY_ENABLED` 保持启用。v2 注册许可保留，弃权记录不删除或篡改。下面首次部署和故障过程为历史证据，判断 flag=1 不是最终配置。

最终登录态复测通过：`/macro` 事实正常、F4 判断区消失，中美 transmission 均 HTTP 200 且 `judgment_status=disabled`。这是事实层发布验收通过，不是判断功能完成。

## 首次部署的版本与注册状态

- main / production codeVersion：`01308b44347421f061cc03cef36a0f172df41bc6`（包含 #132）。
- CI：[42375057467](https://github.com/osborn-studio/osbornalpha/actions/runs/42375057467)，success。
- Vercel deployment：`dpl_AVDJbTXWs3RuGtmZJtUm1xAYYcne`，READY；部署地址 `https://stock-monitor-1whb9u41m-gilosbornhellos-projects.vercel.app`，alias `osbornalpha.com`。
- 约 13:04 UTC 核对：v1 判断数为 0，v2 尚未注册。随后按 #132 代码登记 v2、确认许可并设 `publishable=true`，复查无 drift。v1 原样保留且 unpublished。
- v2 formula hash：`dc26a628372facffa66bc51beb795f23ef755b0f51a82337b4bea17f0c2770ba`。
- 生产配置 `MACRO_JUDGMENTS_ENABLED=1`、`NEXT_PUBLIC_SITE_URL=https://www.osbornalpha.com`；部署后公开 `/api/methodologies` HTTP 200，实际 codeVersion、publishable 和 hash 与上述一致。
- 13:16 UTC settle / calibrate preview HTTP 200、ok。preview 成功不代表真实补登记成功。

## 已验证与未完成

登录态 `/macro` 中美视图、来源抽屉、指标详情、传导、历史、复盘和旧路径重定向通过。逐项证据见 [acceptance.md](acceptance.md)。2026 年 10 月复盘为 `insufficient`，界面如实说明历史截止时点缺少快照。

当前阻碍：

1. 真实判断补登记链路失败；根因为 Supabase `.contains(inputs, JS array)` 将 JSONB 查询编码为 PostgreSQL 数组，导致语法错误。本地修复 `4ee12c7ccb42d25197f31dd5fb24fe1b35c49ee2`（`codex/fix-judgment-json-filter`）通过 52 项定向测试、定向类型检查及 lint，方法 hash 复查不变；全量类型检查受本机缺少 pdfjs-dist 依赖阻碍，不能记录为通过。生产 cron 尚未包含此修复；最终已移除判断 flag 隐藏入口。传导返回 `judgment_status: unavailable`，总览无判断卡片。该项未验收通过，正在修复。
2. cycle-table 单次登录态 GET 为 13,106 ms；这是一次样本，不是 p95，仍未达到延迟目标。
3. `/manifest.json` 被认证中间件重定向，浏览器保留 manifest 语法错误。局部修复 `67df3c62f2f67ac5538fc898f357b2bb9a186a73` 已通过 23 项定向测试及 lint，但尚未发布。
4. GitHub 写权限受阻：本机钥匙串取凭据错误 `-25308`，connector 写分支/树返回 403。不能把本地修复记录为生产已修复。
5. 判断面板描述仍写默认关闭，实际部署 flag 已启用，需同步文案。

## 本地修复对生产补登记的有限验证

修复版本 `4ee12c7c` 本地执行的回执顶层为 success，但 compensation 为 stopped/deadline，scanned=1、produced=1、错误 `deadline_hit`。生产库新增 1 条 US v2 弃权记录，理由 `upstream_version_mismatch`，codeVersion 为本地修复提交，**不是已部署版本**。该回执不能证明判断链路通过，也不能用单条弃权冒充有效宏观判断。MiniMax 最终审查 approved 仅针对修复代码。

## 恢复开发（GitHub 授权已恢复）

此前写权限阻塞已解除。下一阶段继续修复判断链路、核对四象限 UI，并以生产登录态看到真实且有证据的美林时钟结果为验收目标；仅事实页面可用不代表该目标达成。本文此前部署与故障记录作为历史证据保留，新的实测结果另行追加。

## 后续顺序

发布判断链路及 manifest 修复 → 通过对应 CI → 部署精确提交 → 复跑真实补登记和登录态判断/console验收。性能需独立测量冷/热请求，再记录是否达标。保留现有事实页面可用，不将空判断伪装成成功结果。

[MiniMax 发布核对清单](mmx-checklist.md) 是审查建议，不代表测试通过。验收脚本与 manifest 修复由明确调用的 `gpt-6.1-sol` 编写。
