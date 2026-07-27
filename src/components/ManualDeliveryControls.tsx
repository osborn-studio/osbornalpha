'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/Toast';
import { QuotaNotice } from '@/components/QuotaNotice';
import type { QuotaNoticeProps } from '@/components/QuotaNotice';
import { briefSendFailure } from '@/lib/brief/send-response';
import {
  ManualDeliveryView,
  type ManualDeliveryViewCopy,
} from './manual-delivery-view';
import {
  manualDeliveryPayload,
  type ManualDeliveryChannel as DeliveryChannel,
  type ManualDeliveryMode as DeliveryMode,
} from './manual-delivery-request';

export interface ManualDeliveryCopy extends ManualDeliveryViewCopy {
  telegramTestText: string;
  emailTestSubject: string;
  emailTestText: string;
  sendingTelegramTest: string;
  sendingTelegramBrief: string;
  sendingEmailTest: string;
  sendingEmailBrief: string;
  telegramTestSent: (id: string) => string;
  telegramBriefSent: (count: number) => string;
  emailTestSent: (id: string) => string;
  emailBriefSent: (subject: string) => string;
  sendFailed: string;
}

interface ManualDeliveryControlsProps {
  isAdmin: boolean | null;
  copy: ManualDeliveryCopy;
  notify: (message: string) => void;
}

export function ManualDeliveryControls({
  isAdmin,
  copy,
  notify,
}: ManualDeliveryControlsProps) {
  const [quota, setQuota] = useState<QuotaNoticeProps | null>(null);

  async function send(channel: DeliveryChannel, mode: DeliveryMode) {
    const isTelegram = channel === 'telegram';
    const isTest = mode === 'test';
    notify(isTelegram
      ? (isTest ? copy.sendingTelegramTest : copy.sendingTelegramBrief)
      : (isTest ? copy.sendingEmailTest : copy.sendingEmailBrief));
    setQuota(null);

    const payload = manualDeliveryPayload(channel, mode, {
      text: isTelegram ? copy.telegramTestText : copy.emailTestText,
      subject: copy.emailTestSubject,
    });

    try {
      const response = await fetch('/api/brief/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      const result = data?.channels?.[channel];
      if (!response.ok || !result?.ok) {
        const failure = briefSendFailure(
          data,
          result?.error || result?.skipped || copy.sendFailed,
        );
        setQuota(failure.quota);
        notify(`✗ ${failure.message}`);
        return;
      }

      if (isTelegram) {
        notify(isTest
          ? copy.telegramTestSent(String(result.message_id ?? ''))
          : copy.telegramBriefSent(Number(result.chunks_sent ?? 1)));
      } else {
        notify(isTest
          ? copy.emailTestSent(String(result.id ?? '').slice(0, 8))
          : copy.emailBriefSent(String(data?.brief_meta?.subject ?? '').slice(0, 30)));
      }
    } catch (error) {
      notify(`✗ ${error instanceof Error ? error.message : copy.sendFailed}`);
    }
  }

  return (
    <ManualDeliveryView
      isAdmin={isAdmin}
      copy={copy}
      quota={quota ? <QuotaNotice {...quota} /> : null}
      onTelegramTest={() => send('telegram', 'test')}
      onTelegramBrief={() => send('telegram', 'brief')}
      onEmailTest={() => send('email', 'test')}
      onEmailBrief={() => send('email', 'brief')}
    />
  );
}

export function AdminManualDeliveryControls() {
  const t = useTranslations('settings.channels');
  const { show } = useToast();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/usage/today')
      .then(async (response) => {
        if (!response.ok) throw new Error('authorization unavailable');
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setIsAdmin(data?.isAdmin === true);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => { cancelled = true; };
  }, []);

  const copy: ManualDeliveryCopy = {
    heading: t('heading'),
    managedDestination: t('managedDestination'),
    telegramTest: t('tgTestButton'),
    telegramBrief: t('tgBriefButton'),
    emailTest: t('emailTestButton'),
    emailBrief: t('emailBriefButton'),
    telegramTestText: t('tgTestText'),
    emailTestSubject: t('emailTestSubject'),
    emailTestText: t('emailTestText'),
    sendingTelegramTest: t('tgSending'),
    sendingTelegramBrief: t('tgBriefSending'),
    sendingEmailTest: t('emailSending'),
    sendingEmailBrief: t('emailBriefSending'),
    telegramTestSent: (id) => t('tgTestSent', { id }),
    telegramBriefSent: (count) => t('tgBriefSent', { count }),
    emailTestSent: (id) => t('emailSent', { id }),
    emailBriefSent: (subject) => t('emailBriefSent', { subject }),
    sendFailed: t('sendFailed'),
  };

  return <ManualDeliveryControls isAdmin={isAdmin} copy={copy} notify={show} />;
}
