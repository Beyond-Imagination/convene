import { Inject, Injectable } from '@nestjs/common';

import { REPORT_REPOSITORY, ReportRepository } from '@/reports/domain/ports/report.repository';
import { MeetingType } from '@/shared-kernel/domain/value-objects/meeting-type';
import { ReportSummary } from '@/shared-kernel/domain/value-objects/report-summary';

/** 외부 시스템으로 옮길 수 있는 상태(파이프라인 확정)의 회의록 읽기 뷰. */
export interface FinalizedReport {
  readonly reportId: string;
  readonly meetingType: MeetingType;
  /** 회의를 만들어낸 외부 이슈 id. 없으면 옮길 곳이 없다. */
  readonly issueId: string | null;
  readonly title: string | null;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly summary: ReportSummary | null;
}

/** 확정된 회의록의 읽기 전용 뷰를 만든다. notion BC가 회의록을 옮길 때 쓴다. */
@Injectable()
export class ReportLookupService {
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
