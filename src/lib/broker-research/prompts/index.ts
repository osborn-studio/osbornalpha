// Runtime extraction prompt (spec §4.3/§6.4); the reviewed Markdown is checked byte for byte in tests.
export const EXTRACT_PROMPT=`You extract cited facts from one chunk of a sell-side research report.
Return ONE JSON object and nothing else. It must validate against the JSON Schema given in the user message
(additionalProperties is false everywhere).

Rules:
1. Every Evidence has \`value\`, \`page\` (the page number printed in the chunk header \`=== page N ===\`), \`quote\` and \`confidence\` (0..1).
2. \`quote\` must be copied character for character from that page (at most 400 characters). Never paraphrase, never normalise spaces or punctuation.
3. Currencies are separate Evidence: \`quote\` is the marker exactly as printed (US$, HK$, USD, Rmb, ...); \`value\` is the ISO 4217 code.
4. Dates as YYYY-MM-DD in \`value\`; the \`quote\` keeps the printed form.
5. Percentages: \`value\` keeps the printed form (e.g. "20.0%").
6. If the chunk does not state a field, omit it. Do not infer, compute or carry values from other chunks. A missing value is missing.
7. One \`targets[]\` entry per security the report rates; \`ticker.quote\` is the code as printed (e.g. "9988 HK", "BABA US").
8. \`scope\`: single_issuer | multi_issuer | sector | macro_strategy.
`;
export const SUMMARY_PROMPT=`You write the OsbornAlpha independent summary of one sell-side research report, in {{LANG}}.
It is an AI-generated summary, not the institution's text. Output Markdown with exactly these four sections, in this order:

## 报告定位 / Positioning
## 核心结论 / Key conclusions
## 方法论 / Methodology
## 风险与边界 / Risks and limits

(Use the Chinese heading when writing Chinese, the English heading when writing English.)

Hard rules:
1. Do not quote the report. Never copy a run of more than ten consecutive words or characters from the source text; paraphrase.
2. The only numbers you may write are the values in EFFECTIVE_FIELDS. Do not write any other number, year, count, ratio or percentage.
3. Every number must appear in the form "<ticker> 的 <field label> <value> <unit>" (Chinese) or "<ticker>'s <field label> <value> <unit>" (English),
   one number per sentence, e.g. "9988.HK 的 目标价 120.00 HKD" / "9988.HK's target price 120.00 HKD". With a single target the ticker may be omitted.
4. Do not name any analyst. Do not state a target price or upside unless it is in EFFECTIVE_FIELDS.
5. If a section has nothing grounded to say, write one sentence saying the report does not state it.
`;
/** Title translation (run kind 'translate'); disclosure is checked at publish. */
export const TRANSLATE_PROMPT='Translate the research report title into Chinese and English. Answer with JSON {"zh": "...", "en": "..."} only. Keep tickers as written; do not add numbers.';
