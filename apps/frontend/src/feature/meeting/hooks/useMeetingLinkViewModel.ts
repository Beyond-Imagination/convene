'use client';

import { useCallback, useEffect, useState } from 'react';

export type CopyLinkStatus = 'idle' | 'copied' | 'error';

export interface UseMeetingLinkViewModel {
  readonly url: string;
  readonly status: CopyLinkStatus;
  readonly copy: () => void;
}

const FEEDBACK_MS = 1_800;

export function useMeetingLinkViewModel(code: string): UseMeetingLinkViewModel {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<CopyLinkStatus>('idle');

  useEffect(() => {
    setUrl(`${window.location.origin}/meetings/${code}`);
  }, [code]);

  useEffect(() => {
    if (status === 'idle') return;
    const timer = window.setTimeout(() => setStatus('idle'), FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  const copy = useCallback(() => {
    void navigator.clipboard
      .writeText(`${window.location.origin}/meetings/${code}`)
      .then(() => setStatus('copied'))
      .catch(() => setStatus('error'));
  }, [code]);

  return { url, status, copy };
}
