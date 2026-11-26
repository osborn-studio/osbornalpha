import {readFileSync} from 'node:fs';
import active from './active-prompt.json' with {type:'json'};

export function validatePromptCandidate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== 2 || !['extraction','chat'].every(key =>
        Object.hasOwn(value,key) && typeof value[key] === 'string' &&
        [...value[key]].length <= 1200 && !/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(value[key]))) {
    throw new Error('提示词版本须包含 extraction 和 chat 两段文本，每段最多 1200 字。');
  }
  return value;
}

export const activePrompt = Object.freeze(validatePromptCandidate(active));

// Publishers atomically replace this small file. A partial manual edit cannot interrupt a live conversation.
export function createPublishedPromptReader(path = new URL('./active-prompt.json',import.meta.url)) {
  let lastText;
  let lastValid=activePrompt;
  return () => {
    try {
      const text=readFileSync(path,'utf8');
      if (text!==lastText) {
        lastValid=Object.freeze(validatePromptCandidate(JSON.parse(text)));
        lastText=text;
      }
    } catch { /* Keep serving the last verified version. */ }
    return lastValid;
  };
}

export function withPromptGuidance(instructions, guidance) {
  return guidance?.trim() ? instructions + '\n\n' + guidance.trim() : instructions;
}
