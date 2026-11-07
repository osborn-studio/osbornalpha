# 事件黄金集：AAPL 最近 10 份 filing（`filing_published`）

规格 §14、§0 #72。由**实施者之外的人**从 EDGAR filing index 逐条手工抄录（不得复制本模块的输出）。抄录完成后同步写入 `src/lib/company/fixtures/manifest.json` 的 `aapl-filings-last10.expected.filings`，把该条 `status` 改为 `ready`，并填写 `source.transcribed_by/transcribed_at/page_or_row`。

- 来源：https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193&type=10-&dateb=&owner=include&count=40
- 抄录人：
- 抄录日期：
- 夹具截止（`CIK0000320193.trimmed.json` 中最晚的 `filed`）：

| # | accession | form | filed（= 我方 `occurred_on`） | period of report | 抄录备注 | 我方核对结果（复审者填） |
|---|---|---|---|---|---|---|
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |
| 4 |  |  |  |  |  |  |
| 5 |  |  |  |  |  |  |
| 6 |  |  |  |  |  |  |
| 7 |  |  |  |  |  |  |
| 8 |  |  |  |  |  |  |
| 9 |  |  |  |  |  |  |
| 10 |  |  |  |  |  |  |
