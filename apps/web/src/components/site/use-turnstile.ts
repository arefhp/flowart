'use client';

import type { Locale } from '@flowart/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TURNSTILE_SITE_KEY, isTurnstileTestKey } from '@/lib/config';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
    };
  }
}

export type HumanState = 'loading' | 'ready' | 'failed';

/**
 * Cloudflare Turnstile (the spam check) for a form. The always-pass TEST key needs no script, so
 * local development works offline. The server verifies the token again; this only collects it.
 * Put `ref={widgetRef}` on an empty div when `showWidget` is true.
 */
export function useTurnstile(locale: Locale) {
  const [token, setToken] = useState('');
  const [state, setState] = useState<HumanState>('loading');
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const testKey = isTurnstileTestKey(TURNSTILE_SITE_KEY);

  useEffect(() => {
    if (testKey) {
      setToken('local-test-token');
      setState('ready');
      return;
    }
    let script = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
    const render = () => {
      if (!window.turnstile || !widgetRef.current || widgetId.current) return;
      widgetId.current = window.turnstile.render(widgetRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        language: locale,
        callback: (tok: string) => {
          setToken(tok);
          setState('ready');
        },
        'expired-callback': () => setToken(''),
        'error-callback': () => setState('failed'),
      });
    };
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.dataset.turnstile = '1';
      script.onerror = () => setState('failed');
      document.head.appendChild(script);
    }
    if (window.turnstile) render();
    else script.addEventListener('load', render);
    return () => script?.removeEventListener('load', render);
  }, [locale, testKey]);

  /** A token works once; ask for a fresh one after the server rejects it. */
  const reset = useCallback(() => {
    setToken('');
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  }, []);

  return { token, state, widgetRef, reset, showWidget: !testKey };
}
