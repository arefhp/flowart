'use client';

import { useEffect } from 'react';

/** Labelled form control with an optional hint and a field error. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-sm text-stone">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Notice({ kind, children }: { kind: 'success' | 'error' | 'info'; children: React.ReactNode }) {
  const styles = {
    success: 'border-[#2f6b4f] text-[#1d4a35]',
    error: 'border-alert text-alert',
    info: 'border-hairline text-stone',
  }[kind];
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={`border-l-4 bg-paper px-4 py-3 ${styles}`}>
      {children}
    </p>
  );
}

/** Warn before leaving the page with unsaved changes. */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}

export function PageTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
      <h1 className="text-3xl">{children}</h1>
      {aside}
    </div>
  );
}

export const charCount = (value: string, max: number) => `${value.length} / ${max}`;
