import { createTranslator } from 'next-intl';
import macro from '../../../messages/en/macro.json';
export async function getTranslations(namespace: 'macro') {
  return createTranslator({ locale: 'en', messages: { macro }, namespace });
}
