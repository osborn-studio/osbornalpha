'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { getBrowserSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

// '' / null / 未登录 / 未配置 → undefined = 跟随浏览器时区
const TimezoneContext = createContext<string | undefined>(undefined);
export function useDisplayTimezone(): string | undefined { return useContext(TimezoneContext); }

export function TimezoneProvider({ children }: { children: React.ReactNode }) {
  const [tz, setTz] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const sb = getBrowserSupabase();
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await sb.from('user_preferences')
        .select('timezone').eq('user_id', user.id).maybeSingle();
      const v = (data as any)?.timezone;
      if (v) setTz(v);
    });
  }, []);
  return <TimezoneContext.Provider value={tz}>{children}</TimezoneContext.Provider>;
}
