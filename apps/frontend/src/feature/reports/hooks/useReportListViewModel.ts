'use client';

import type { ReportListItem } from '@convene/shared-interfaces';
import { useCallback, useEffect, useState } from 'react';

import { listReports } from '@/shared/api/reports.api';

type ReportListStatus = 'loading' | 'loaded' | 'error';

export interface UseReportListViewModel {
  readonly status: ReportListStatus;
  readonly items: ReadonlyArray<ReportListItem>;
  readonly errorMessage: string | null;
  readonly refresh: () => Promise<void>;
}

/**
 * /reports 회의록 목록 페이지의 ViewModel.
 *
 * 책임: mount 시 GET /reports, 상태 머신(loading/loaded/error), refresh() 노출.
 * 정적 export 빌드에서 server 쪽 fetch가 없으므로 모든 데이터는 client mount 시 가져온다.
 */
export function useReportListViewModel(): UseReportListViewModel {
  const [status, setStatus] = useState<ReportListStatus>('loading');
  const [items, setItems] = useState<ReportListItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus('loading');
    setErrorMessage(null);
    try {
      const next = await listReports();
      setItems(next);
      setStatus('loaded');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setErrorMessage(message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, items, errorMessage, refresh };
}
