import { createElement, type ReactNode } from 'react';

export interface ManualDeliveryViewCopy {
  heading: string;
  managedDestination: string;
  telegramTest: string;
  telegramBrief: string;
  emailTest: string;
  emailBrief: string;
}

interface ManualDeliveryViewProps {
  isAdmin: boolean | null;
  copy: ManualDeliveryViewCopy;
  quota?: ReactNode;
  onTelegramTest: () => void;
  onTelegramBrief: () => void;
  onEmailTest: () => void;
  onEmailBrief: () => void;
}

export function ManualDeliveryView({
  isAdmin,
  copy,
  quota,
  onTelegramTest,
  onTelegramBrief,
  onEmailTest,
  onEmailBrief,
}: ManualDeliveryViewProps) {
  if (isAdmin !== true) return null;

  const button = (
    key: string,
    label: string,
    onClick: () => void,
    primary = false,
  ) => createElement('button', {
    key,
    type: 'button',
    onClick,
    className: primary
      ? 'rounded bg-accent-dim px-3 py-1.5 text-xs text-white'
      : 'rounded border border-border bg-bg-card px-3 py-1.5 text-xs text-text-dim',
  }, label);

  return createElement('div', { className: 'card-base' }, [
    createElement('div', {
      key: 'heading',
      className: 'mb-3 text-sm font-semibold text-text-dim',
    }, copy.heading),
    quota ? createElement('div', { key: 'quota', className: 'mb-3' }, quota) : null,
    createElement('p', {
      key: 'destination',
      className: 'mb-3 text-xs text-text-muted',
    }, copy.managedDestination),
    createElement('div', { key: 'actions', className: 'flex flex-wrap gap-2' }, [
      button('telegram-test', copy.telegramTest, onTelegramTest, true),
      button('telegram-brief', copy.telegramBrief, onTelegramBrief),
      button('email-test', copy.emailTest, onEmailTest, true),
      button('email-brief', copy.emailBrief, onEmailBrief),
    ]),
  ]);
}
