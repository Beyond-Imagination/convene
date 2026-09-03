'use client';

import {
  DEFAULT_REPORT_PAGE_SIZE,
  type PageMetaWire,
  type ReportListItem,
} from '@convene/shared-interfaces';
import { useCallback, useEffect, useState } from 'react';

import { listReports } from '@/shared/api/reports.api';

type ReportListStatus = 'loading' | 'loaded' | 'error';

const EMPTY_PAGE: PageMetaWire = {
  number: 1,
  size: DEFAULT_REPORT_PAGE_SIZE,
  totalItems: 0,
  totalPages: 0,
};

export interface UseReportListViewModel {
  readonly status: ReportListStatus;
  readonly items: ReadonlyArray<ReportListItem>;
  readonly page: PageMetaWire;
  readonly errorMessage: string | null;
  readonly refresh: () => Promise<void>;
  readonly goToPage: (page: number) => void;
}

/**
 * /reports 회의록 목록 페이지의 ViewModel.
 *
 * 책임: 현재 페이지 보관, GET /reports 호출, 상태 머신(loading/loaded/error), 페이지 이동.
 * 정적 export 빌드라 페이지 번호는 URL이 아니라 컴포넌트 상태로만 들고 있다.
 */
export function useReportListViewModel(): UseReportListViewModel {
  const [pageNumber, setPageNumber] = useState(1);
  const [status, setStatus] = useState<ReportListStatus>('loading');
  const [items, setItems] = useState<ReportListItem[]>([]);
  const [page, setPage] = useState<PageMetaWire>(EMPTY_PAGE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async (target: number) => {
    setStatus('loading');
    setErrorMessage(null);
    try {
      const response = await listReports({ page: target });
      setItems(response.items);
      setPage(response.page);
      setStatus('loaded');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setErrorMessage(message);
      setStatus('error');
    }
  }, []);

  const refresh = useCallback(async () => {
    await load(pageNumber);
  }, [load, pageNumber]);

  const goToPage = useCallback((next: number) => {
    setPageNumber(Math.max(1, next));
  }, []);

  useEffect(() => {
    void load(pageNumber);
  }, [load, pageNumber]);

  return { status, items, page, errorMessage, refresh, goToPage };
}
