export type ManualDeliveryChannel = 'telegram' | 'email';
export type ManualDeliveryMode = 'test' | 'brief';

const MAX_MANUAL_TEXT_LENGTH = 4_000;
const MAX_MANUAL_SUBJECT_LENGTH = 200;
const MAX_MANUAL_TOP_N = 5;

export function manualDeliveryPayload(
  channel: ManualDeliveryChannel,
  mode: ManualDeliveryMode,
  content: { text?: string; subject?: string },
) {
  if (mode === 'brief') {
    return { channels: [channel], topN: MAX_MANUAL_TOP_N };
  }
  return {
    channels: [channel],
    text: (content.text ?? '').slice(0, MAX_MANUAL_TEXT_LENGTH),
    ...(channel === 'email'
      ? { subject: (content.subject ?? '').slice(0, MAX_MANUAL_SUBJECT_LENGTH) }
      : {}),
  };
}
