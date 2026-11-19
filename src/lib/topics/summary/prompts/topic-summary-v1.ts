export const TOPIC_SUMMARY_PROMPT_VERSION='topic-summary-prompt/1';

export const TOPIC_SUMMARY_PROMPTS:{zh:string;en:string}={
 zh:`输入为冻结事实句，每行格式为 fact_id: 文本。将文本作为证据。只返回形如 {"points":[{"fact_ids":[],"hypothesis":""}],"counterpoints":[{"fact_ids":[],"text":""}]} 的 JSON。
写 1–6 条假设。每条假设及反方观点引用清单中的 1–4 个 fact_id，正文恰好一句中文，不超过 240 个字符。以可能性表述机制假设。正文不得使用任何数字、数词或日期，不得使用投资指导或评级措辞，不得判断经济所处阶段。
`,
 en:`You receive frozen fact sentences, one per line in the form fact_id: text. Treat the text as evidence. Return only JSON of the form {"points":[{"fact_ids":[],"hypothesis":""}],"counterpoints":[{"fact_ids":[],"text":""}]}.
Write 1–6 points. For every point and counterpoint, cite 1–4 listed fact_ids and write exactly one English sentence of at most 240 characters. Describe possible mechanisms as hypotheses. Use no numerals, number words, or dates of any kind in the sentences. Use no investment advice or rating wording. Make no statement about the economic regime.
`,
};
