import {getBrowserSupabase, isSupabaseConfigured} from '@/lib/supabase/client';
import type {AppLocale} from '@/lib/i18n/locale';

export async function selectLanguage(l: AppLocale, refresh: () => void) {
  document.cookie = `NEXT_LOCALE=${l};path=/;max-age=31536000`;
  if (isSupabaseConfigured()) {
    const sb = getBrowserSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      await (sb as any).from('user_preferences').upsert(
        { user_id: user.id, language: l },
        { onConflict: 'user_id' }
      );
    }
  }
  refresh();
}
