export type ProviderId = 'ark' | 'deepseek' | 'openai' | 'kimi' | 'minimax';

export interface ProviderDef {
  id: ProviderId;
  label: string;
  baseUrl: string;
  defaultModel: string;
  chatPath: string;
  protocol: 'openai' | 'anthropic';
}

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  ark: {
    id: 'ark',
    label: '火山引擎 ARK (Agent Plan)',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/coding',
    defaultModel: 'doubao-seed-code',
    chatPath: '/v1/messages',
    protocol: 'anthropic',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    chatPath: '/chat/completions',
    protocol: 'openai',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI (ChatGPT)',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    chatPath: '/chat/completions',
    protocol: 'openai',
  },
  kimi: {
    id: 'kimi',
    label: 'Kimi (Moonshot)',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-32k',
    chatPath: '/chat/completions',
    protocol: 'openai',
  },
  minimax: {
    id: 'minimax',
    label: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    defaultModel: 'MiniMax-Text-01',
    chatPath: '/text/chatcompletion_v2',
    protocol: 'openai',
  },
};

export const PROVIDER_IDS: ProviderId[] = ['ark', 'deepseek', 'openai', 'kimi', 'minimax'];

export function getProvider(id: string): ProviderDef | null {
  if ((PROVIDER_IDS as string[]).includes(id)) {
    return PROVIDERS[id as ProviderId];
  }
  return null;
}
