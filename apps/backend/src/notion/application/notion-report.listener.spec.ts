import { ReportFinalizedPayload } from '@/shared-kernel/domain/events/report-finalized.payload';
import { stub } from '@/shared-kernel/testing/stub';

import { NotionReportListener } from './notion-report.listener';
import { NotionReportPushService } from './notion-report-push.service';

describe('NotionReportListener.onReportFinalized', () => {
  it('payload.reportId를 push 유스케이스에 위임한다', async () => {
    const service = { pushFinalizedReport: jest.fn(async () => {}) };
    const listener = new NotionReportListener(stub<NotionReportPushService>(service));
    const payload: ReportFinalizedPayload = { reportId: 'rep_001' };

    await listener.onReportFinalized(payload);

    expect(service.pushFinalizedReport).toHaveBeenCalledWith('rep_001');
  });
});
