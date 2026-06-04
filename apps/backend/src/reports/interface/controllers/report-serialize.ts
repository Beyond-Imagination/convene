import {
  ReportDetailResponse,
  ReportListItem,
  ReportPipelineWire,
} from '@convene/shared-interfaces';

import { MeetingReport } from '@/reports/domain/meeting-report';

/**
 * Interface layer 의 도메인 → wire format 직렬화 helper.
 *
 * 컨트롤러는 비즈니스 로직을 두지 않으며, 본 helper 가 `MeetingReport` Aggregate 의
 * snapshot 을 shared-interfaces wire format 으로 평면화한다.
 */
export function toReportListItem(report: MeetingReport): ReportListItem {
  const snapshot = report.snapshot();
  return {
    id: snapshot.id,
    code: snapshot.code,
    source: snapshot.source,
    startedAt: snapshot.startedAt.toISOString(),
    endedAt: snapshot.endedAt.toISOString(),
    participantCount: snapshot.participants.length,
    pipeline: {
      sttStatus: snapshot.pipeline.sttStatus,
      summaryStatus: snapshot.pipeline.summaryStatus,
    },
    // 사용자가 지정한 회의 제목 우선, 없으면 LLM 요약 제목.
    title: snapshot.title ?? snapshot.summary?.title ?? null,
  };
}

export function toReportDetailResponse(report: MeetingReport): ReportDetailResponse {
  const snapshot = report.snapshot();
  return {
    id: snapshot.id,
    meetingId: snapshot.meetingId,
    code: snapshot.code,
    source: snapshot.source,
    title: snapshot.title ?? snapshot.summary?.title ?? null,
    externalReference:
      snapshot.externalReference.issueId === undefined
        ? {}
        : { issueId: snapshot.externalReference.issueId },
    startedAt: snapshot.startedAt.toISOString(),
    endedAt: snapshot.endedAt.toISOString(),
    participants: snapshot.participants.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      joinedAt: p.joinedAt.toISOString(),
      leftAt: p.leftAt === null ? null : p.leftAt.toISOString(),
    })),
    chat: snapshot.chat.map((c) => ({
      nickname: c.nickname,
      text: c.text,
      sentAt: c.sentAt.toISOString(),
    })),
    transcript: snapshot.transcript.map((t) =>
      t.speaker === undefined
        ? { text: t.text, startMs: t.startMs, endMs: t.endMs }
        : { speaker: t.speaker, text: t.text, startMs: t.startMs, endMs: t.endMs },
    ),
    summary:
      snapshot.summary === null
        ? null
        : {
            title: snapshot.summary.title,
            overview: snapshot.summary.overview,
            decisions: [...snapshot.summary.decisions],
            actionItems: snapshot.summary.actionItems.map((a) =>
              a.owner === undefined && a.due === undefined
                ? { task: a.task }
                : { ...a },
            ),
            keyTopics: snapshot.summary.keyTopics.map((k) => ({
              topic: k.topic,
              points: [...k.points],
            })),
          },
    pipeline: toPipelineWire(snapshot.pipeline),
    pushedToNotion:
      snapshot.pushedToNotion === null
        ? null
        : {
            pageId: snapshot.pushedToNotion.pageId,
            at: snapshot.pushedToNotion.at.toISOString(),
          },
  };
}

function toPipelineWire(p: MeetingReport['pipeline']): ReportPipelineWire {
  return {
    sttStatus: p.sttStatus,
    summaryStatus: p.summaryStatus,
    failures: p.failures.map((f) => ({
      stage: f.stage,
      error: f.error,
      at: f.at.toISOString(),
    })),
  };
}
