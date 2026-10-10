'use client';

import { useEffect, useState } from 'react';
import type { EventAvailability } from '@/lib/types';

/**
 * The current time in the browser. The first render uses the time the page was BUILT (so the
 * static HTML and the first client render agree); right after loading it switches to the real
 * clock, so a workshop that has finished since the build moves to "past" without a rebuild.
 */
export function useNow(builtAtMs: number): number {
  const [now, setNow] = useState(builtAtMs);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * Live places for every upcoming workshop in ONE request. Static pages never carry capacity, so
 * the numbers are fetched here, uncached. Until they arrive (or if the request fails) the map is
 * empty and the pages simply show no place count.
 */
export function useAvailability(): Map<string, EventAvailability> {
  const [map, setMap] = useState<Map<string, EventAvailability>>(new Map());
  useEffect(() => {
    let current = true;
    fetch('/api/events/availability', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { events?: EventAvailability[] } | null) => {
        if (current && body?.events) setMap(new Map(body.events.map((e) => [e.slug, e])));
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  return map;
}
