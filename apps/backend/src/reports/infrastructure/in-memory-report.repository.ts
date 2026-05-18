import { Injectable } from '@nestjs/common';

import { MeetingReport } from '@/reports/domain/meeting-report';
import { ReportRepository } from '@/reports/domain/ports';

/**
 * ReportRepository 의 in-memory 구현체.
 *
 * v1 부트스트랩 / e2e 테스트용. MongoDB 어댑터로 교체되기 전까지의 default
 * provider 이며, 동시성/영속성 보장은 없다.
 *
 * `listRecent` 는 `endedAt` 내림차순으로 정렬해 회의록 목록 페이지에서 최신순
 * 노출을 단순히 모사한다.
 */
@Injectable()
export class InMemoryReportRepository implements ReportRepository {
  private readonly store = new Map<string, MeetingReport>();

  async save(report: MeetingReport): Promise<void> {
    this.store.set(report.id, report);
  }

  async findById(id: string): Promise<MeetingReport | null> {
    return this.store.get(id) ?? null;
  }

  async findByMeetingId(meetingId: string): Promise<MeetingReport | null> {
    for (const r of this.store.values()) {
      if (r.meetingId === meetingId) return r;
    }
    return null;
  }

  async listRecent(limit: number): Promise<MeetingReport[]> {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error(`listRecent.limit must be a non-negative integer, got ${limit}`);
    }
    return Array.from(this.store.values())
      .sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime())
      .slice(0, limit);
  }
}
