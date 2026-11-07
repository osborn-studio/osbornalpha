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
