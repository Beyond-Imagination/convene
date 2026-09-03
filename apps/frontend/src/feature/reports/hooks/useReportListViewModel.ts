'use client';

import {
  DEFAULT_REPORT_PAGE_SIZE,
  type PageMetaWire,
  type ReportListItem,
} from '@convene/shared-interfaces';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { listReports } from '@/shared/api/reports.api';

type ReportListStatus = 'loading' | 'loaded' | 'error';

const PAGE_QUERY_KEY = 'page';

const EMPTY_PAGE: PageMetaWire = {
  number: 1,
  size: DEFAULT_REPORT_PAGE_SIZE,
  totalItems: 0,
  totalPages: 0,
};

/** 쿼리스트링은 사용자가 손댈 수 있으므로 1 이상의 정수가 아니면 첫 페이지로 본다. */
function parsePageParam(raw: string | null): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

function pageHref(page: number): string {
  return page === 1 ? '/reports' : `/reports?${PAGE_QUERY_KEY}=${page}`;
}

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
 * 현재 페이지는 `?page=` 쿼리가 원본이라 새로고침·뒤로가기·링크 공유가 그대로 살아난다.
 * 페이지 이동은 URL을 바꾸고, 그 변화를 받아 다시 조회한다.
 */
export function useReportListViewModel(): UseReportListViewModel {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageNumber = parsePageParam(searchParams.get(PAGE_QUERY_KEY));

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

  const goToPage = useCallback(
    (next: number) => {
      router.push(pageHref(Math.max(1, next)));
    },
    [router],
  );

  useEffect(() => {
    void load(pageNumber);
  }, [load, pageNumber]);

  return { status, items, page, errorMessage, refresh, goToPage };
}
