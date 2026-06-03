'use client';

import type { ReportDetailResponse } from '@convene/shared-interfaces';
import { useEffect, useState } from 'react';

import { getReport, ReportsApiError } from '@/shared/api/reports.api';

/**
 * /reports/[id] 회의록 상세 페이지의 ViewModel.
 *
 * `id` 가 빈 문자열이면 idle 유지(정적 export 의 placeholder route 진입 등). id 가
 * 변경되면 새 id 로 다시 fetch. 404 는 별도 status 로 구분해 View 가 "삭제됨/없음"
 * 안내를 쉽게 띄울 수 있게 한다.
 */
export type ReportDetailStatus = 'idle' | 'loading' | 'loaded' | 'not-found' | 'error';

export interface UseReportDetailViewModel {
  readonly status: ReportDetailStatus;
  readonly report: ReportDetailResponse | null;
  readonly errorMessage: string | null;
}

export function useReportDetailViewModel(id: string): UseReportDetailViewModel {
  const [status, setStatus] = useState<ReportDetailStatus>(
    id === '' ? 'idle' : 'loading',
  );
  const [report, setReport] = useState<ReportDetailResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (id === '') {
      setStatus('idle');
      setReport(null);
      setErrorMessage(null);
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setErrorMessage(null);
    void (async () => {
      try {
        const next = await getReport(id);
        if (cancelled) return;
        setReport(next);
        setStatus('loaded');
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ReportsApiError && e.status === 404) {
          setReport(null);
          setStatus('not-found');
          return;
        }
        const message = e instanceof Error ? e.message : String(e);
        setErrorMessage(message);
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { status, report, errorMessage };
}
