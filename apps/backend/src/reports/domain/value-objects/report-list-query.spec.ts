import {
  DEFAULT_REPORT_SORT,
  MAX_REPORT_PAGE_SIZE,
  REPORT_SORT_OPTIONS,
} from '@convene/shared-interfaces';

import { REPORT_SORT_SPECS, reportListCriteria } from './report-list-query';

describe('reportListCriteria', () => {
  it('page/size/sort를 담고 offset을 파생한다', () => {
    expect(reportListCriteria({ page: 3, size: 20, sort: 'latest' })).toEqual({
      page: 3,
      size: 20,
      sort: 'latest',
      offset: 40,
    });
  });

  it('첫 페이지의 offset은 0이다', () => {
    expect(reportListCriteria({ page: 1, size: 20, sort: DEFAULT_REPORT_SORT }).offset).toBe(0);
  });

  it('page는 1 이상의 정수여야 한다', () => {
    expect(() => reportListCriteria({ page: 0, size: 20, sort: DEFAULT_REPORT_SORT })).toThrow();
    expect(() => reportListCriteria({ page: -1, size: 20, sort: DEFAULT_REPORT_SORT })).toThrow();
    expect(() => reportListCriteria({ page: 1.5, size: 20, sort: DEFAULT_REPORT_SORT })).toThrow();
  });

  it('size는 1~MAX 범위의 정수여야 한다', () => {
    expect(() => reportListCriteria({ page: 1, size: 0, sort: DEFAULT_REPORT_SORT })).toThrow();
    expect(() =>
      reportListCriteria({ page: 1, size: MAX_REPORT_PAGE_SIZE + 1, sort: DEFAULT_REPORT_SORT }),
    ).toThrow();
    expect(() => reportListCriteria({ page: 1, size: 2.5, sort: DEFAULT_REPORT_SORT })).toThrow();
  });
});

describe('REPORT_SORT_SPECS', () => {
  it('latest는 endedAt 내림차순이다', () => {
    expect(REPORT_SORT_SPECS.latest).toEqual({ field: 'endedAt', direction: 'desc' });
  });

  it('모든 정렬 프리셋이 spec을 갖는다', () => {
    for (const option of REPORT_SORT_OPTIONS) {
      expect(REPORT_SORT_SPECS[option]).toBeDefined();
    }
  });
});
