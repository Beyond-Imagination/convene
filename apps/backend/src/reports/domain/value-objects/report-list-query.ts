import { MAX_REPORT_PAGE_SIZE, ReportSortOption } from '@convene/shared-interfaces';

/** 정렬 프리셋이 실제로 어떤 필드·방향인지. 정렬 축이 늘어나면 이 표에만 더한다. */
export interface ReportSortSpec {
  readonly field: 'endedAt';
  readonly direction: 'asc' | 'desc';
}

export const REPORT_SORT_SPECS: Record<ReportSortOption, ReportSortSpec> = {
  latest: { field: 'endedAt', direction: 'desc' },
};

/** 목록 한 페이지. `totalItems`는 전체 페이지 수 계산에 쓴다. */
export interface Page<T> {
  readonly items: ReadonlyArray<T>;
  readonly totalItems: number;
}

/**
 * 회의록 목록 조회 조건.
 *
 * 검색이 생기면 이 타입에 조건을 더하고 Repository가 그것까지 해석한다.
 */
export interface ReportListCriteria {
  /** 1-based. */
  readonly page: number;
  readonly size: number;
  readonly sort: ReportSortOption;
  /** 건너뛸 문서 수. page/size에서 파생된다. */
  readonly offset: number;
}

export function reportListCriteria(input: {
  page: number;
  size: number;
  sort: ReportSortOption;
}): ReportListCriteria {
  const { page, size, sort } = input;
  if (!Number.isInteger(page) || page < 1) {
    throw new Error(`ReportListCriteria.page must be an integer >= 1, got ${page}`);
  }
  if (!Number.isInteger(size) || size < 1 || size > MAX_REPORT_PAGE_SIZE) {
    throw new Error(
      `ReportListCriteria.size must be an integer in 1~${MAX_REPORT_PAGE_SIZE}, got ${size}`,
    );
  }
  return { page, size, sort, offset: (page - 1) * size };
}
