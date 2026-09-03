import { DEFAULT_REPORT_PAGE_SIZE } from '@convene/shared-interfaces';

import { ReportFinalizationService } from '@/reports/application/report-finalization.service';
import { MeetingReport } from '@/reports/domain/meeting-report';
import { Page, ReportListCriteria } from '@/reports/domain/value-objects/report-list-query';
import { stub } from '@/shared-kernel/testing/stub';

import { ListReportsQueryDto } from './list-reports-query.dto';
import { ReportsController } from './reports.controller';

const makeController = () => {
  const criterias: ReportListCriteria[] = [];
  const service = stub<ReportFinalizationService>({
    listPage: jest.fn(async (criteria: ReportListCriteria): Promise<Page<MeetingReport>> => {
      criterias.push(criteria);
      return { items: [], totalItems: 0 };
    }),
  });
  return { controller: new ReportsController(service), criterias };
};

const queryOf = (overrides: Partial<ListReportsQueryDto> = {}): ListReportsQueryDto =>
  Object.assign(new ListReportsQueryDto(), overrides);

describe('ReportsController.listReports', () => {
  it('쿼리가 비면 첫 페이지 + 기본 크기 + 기본 정렬로 조회한다', async () => {
    const { controller, criterias } = makeController();
    await controller.listReports(queryOf());
    expect(criterias).toEqual([
      { page: 1, size: DEFAULT_REPORT_PAGE_SIZE, sort: 'latest', offset: 0 },
    ]);
  });

  it('page/size/sort를 criteria로 옮긴다', async () => {
    const { controller, criterias } = makeController();
    await controller.listReports(queryOf({ page: 3, size: 10, sort: 'latest' }));
    expect(criterias).toEqual([{ page: 3, size: 10, sort: 'latest', offset: 20 }]);
  });

  it('빈 페이지도 페이지 메타와 함께 응답한다', async () => {
    const { controller } = makeController();
    const response = await controller.listReports(queryOf({ size: 20 }));
    expect(response.items).toEqual([]);
    expect(response.page).toEqual({ number: 1, size: 20, totalItems: 0, totalPages: 0 });
  });
});
