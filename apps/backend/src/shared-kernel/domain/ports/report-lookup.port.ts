import { MeetingType } from '@/shared-kernel/domain/value-objects/meeting-type';
import { ReportSummary } from '@/shared-kernel/domain/value-objects/report-summary';

// 다른 BC가 reports 내부를 import하지 않고 확정된 회의록을 읽는 Port(하드룰 7).
// shared-kernel에 추상만 두고 reports BC가 구현한다.
export const REPORT_LOOKUP_PORT = Symbol('REPORT_LOOKUP_PORT');

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

export interface ReportLookupPort {
  /** 확정되지 않았거나 없는 회의록이면 null. */
  findFinalizedReport(reportId: string): Promise<FinalizedReport | null>;
}
