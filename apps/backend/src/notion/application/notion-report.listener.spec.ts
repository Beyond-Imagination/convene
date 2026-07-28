import { ReportFinalizedPayload } from '@/shared-kernel/domain/events';

import { NotionReportListener } from './notion-report.listener';
import { NotionReportPushService } from './notion-report-push.service';

describe('NotionReportListener.onReportFinalized', () => {
  it('payload.reportId를 push 유스케이스에 위임한다', async () => {
    const service = { pushFinalizedReport: jest.fn(async () => {}) };
    const listener = new NotionReportListener(service as unknown as NotionReportPushService);
    const payload: ReportFinalizedPayload = { reportId: 'rep_001' };

    await listener.onReportFinalized(payload);

    expect(service.pushFinalizedReport).toHaveBeenCalledWith('rep_001');
  });
});
