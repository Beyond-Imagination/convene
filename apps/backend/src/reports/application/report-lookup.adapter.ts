import { Inject, Injectable } from '@nestjs/common';

import { REPORT_REPOSITORY, ReportRepository } from '@/reports/domain/ports';
import { FinalizedReport, ReportLookupPort } from '@/shared-kernel/domain/ports';

@Injectable()
export class ReportLookupAdapter implements ReportLookupPort {
  constructor(@Inject(REPORT_REPOSITORY) private readonly repository: ReportRepository) {}

  async findFinalizedReport(reportId: string): Promise<FinalizedReport | null> {
    const report = await this.repository.findById(reportId);
    if (report === null || !report.isFinalized) return null;

    const snapshot = report.snapshot();
    return {
      reportId: snapshot.id,
      meetingType: snapshot.meetingType,
      issueId: snapshot.externalReference.issueId ?? null,
      // 회의록 화면과 같은 규칙: 사용자가 지정한 회의 제목 우선, 없으면 LLM 요약 제목.
      title: snapshot.title ?? snapshot.summary?.title ?? null,
      startedAt: snapshot.startedAt,
      endedAt: snapshot.endedAt,
      summary: snapshot.summary,
    };
  }
}
