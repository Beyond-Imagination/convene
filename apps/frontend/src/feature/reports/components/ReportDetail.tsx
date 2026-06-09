'use client';

import type { ReportDetailResponse, ReportSummaryWire } from '@convene/shared-interfaces';

import type { UseReportDetailViewModel } from '@/feature/reports/hooks/useReportDetailViewModel';

export type ReportDetailProps = UseReportDetailViewModel;

const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

function SummarySection({ summary }: { readonly summary: ReportSummaryWire }) {
  return (
    <section
      data-testid="report-summary"
      className="border-border bg-surface rounded-xl border p-6"
    >
      <h2 className="text-text text-xl font-bold">{summary.title}</h2>
      <p className="text-text mt-2 whitespace-pre-line text-sm leading-relaxed">
        {summary.overview}
      </p>

      {summary.decisions.length > 0 && (
        <section className="mt-5">
          <h3 className="text-muted mb-2 text-sm font-bold">결정 사항</h3>
          <ul className="text-text list-disc space-y-1 pl-5 text-sm">
            {summary.decisions.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </section>
      )}

      {summary.actionItems.length > 0 && (
        <section className="mt-5">
          <h3 className="text-muted mb-2 text-sm font-bold">액션 아이템</h3>
          <ul className="text-text space-y-1.5 text-sm">
            {summary.actionItems.map((a, i) => (
              <li
                key={i}
                className="flex flex-wrap items-baseline gap-1"
              >
                {a.owner !== undefined && <strong className="text-accent">{a.owner}</strong>}
                <span>{a.task}</span>
                {a.due !== undefined && <em className="text-muted"> ({a.due})</em>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.keyTopics.length > 0 && (
        <section className="mt-5">
          <h3 className="text-muted mb-2 text-sm font-bold">핵심 토픽</h3>
          <ul className="text-text space-y-3 text-sm">
            {summary.keyTopics.map((t, i) => (
              <li key={i}>
                <strong className="text-text">{t.topic}</strong>
                <ul className="text-muted mt-1 list-disc space-y-1 pl-5">
                  {t.points.map((p, j) => (
                    <li key={j}>{p}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

function Body({ report }: { readonly report: ReportDetailResponse }) {
  return (
    <article className="flex flex-col gap-5">
      <header>
        <h1 className="text-text text-2xl font-bold tracking-tight">
          {report.title ?? `회의록 ${report.code}`}
        </h1>
        <p className="text-muted mt-1 text-sm">
          {formatDate(report.startedAt)} ~ {formatDate(report.endedAt)}
        </p>
      </header>

      {report.summary !== null ? (
        <SummarySection summary={report.summary} />
      ) : (
        <p
          data-testid="summary-pending"
          role="status"
          aria-live="polite"
          className="border-border bg-surface text-muted rounded-xl border border-dashed py-10 text-center"
        >
          요약이 진행 중입니다…
        </p>
      )}

      <section
        data-testid="report-participants"
        aria-labelledby="participants-heading"
        className="border-border bg-surface rounded-xl border p-6"
      >
        <h2
          id="participants-heading"
          className="text-muted mb-3 text-sm font-bold"
        >
          참가자
        </h2>
        <ul className="flex flex-wrap gap-2">
          {report.participants.map((p) => (
            <li
              key={p.id}
              className="bg-bg text-text rounded-full px-3 py-1 text-sm font-medium"
            >
              {p.nickname}
            </li>
          ))}
        </ul>
      </section>

      <section
        data-testid="report-chat"
        aria-labelledby="chat-heading"
        className="border-border bg-surface rounded-xl border p-6"
      >
        <h2
          id="chat-heading"
          className="text-muted mb-3 text-sm font-bold"
        >
          채팅 로그
        </h2>
        <ul className="space-y-1.5 text-sm">
          {report.chat.map((c, i) => (
            <li
              key={i}
              data-testid="report-chat-entry"
            >
              <strong className="text-text">{c.nickname}</strong>
              <span className="text-muted">: </span>
              <span className="text-text">{c.text}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

/**
 * 회의록 상세 페이지의 dumb View.
 *
 * ViewModel의 status 머신을 그대로 분기 렌더하고, summary/participants/chat/transcript를 각각 섹션으로 보여준다.
 * STT/요약 파이프라인이 아직 끝나지 않은(pending/processing) 상태는 "진행 중" 안내로 분기.
 */
export function ReportDetail({ status, report, errorMessage }: ReportDetailProps) {
  if (status === 'loading' || status === 'idle') {
    return (
      <p
        role="status"
        aria-live="polite"
        className="text-muted py-12 text-center"
      >
        불러오는 중…
      </p>
    );
  }

  if (status === 'not-found') {
    return (
      <p
        data-testid="report-not-found"
        className="border-border bg-surface text-muted rounded-xl border border-dashed py-16 text-center"
      >
        회의록을 찾을 수 없습니다.
      </p>
    );
  }

  if (status === 'error' || report === null) {
    return (
      <p
        role="alert"
        className="border-border bg-surface text-danger rounded-xl border py-12 text-center text-sm"
      >
        {errorMessage ?? '오류가 발생했습니다.'}
      </p>
    );
  }

  return <Body report={report} />;
}
