'use client';

import type { ReportDetailResponse, ReportSummaryWire } from '@convene/shared-interfaces';
import type { ReactNode } from 'react';

import type { UseReportDetailViewModel } from '@/feature/reports/hooks/useReportDetailViewModel';

export type ReportDetailProps = UseReportDetailViewModel;

const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

/** 문서 안의 한 섹션. 제목은 mono 대문자 캡션 + 밑줄로 본문과 구분한다. */
function Section({
  title,
  testId,
  children,
}: {
  readonly title: string;
  readonly testId?: string;
  readonly children: ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      aria-label={title}
    >
      <h3 className="cap border-border mb-4 border-b pb-2.5 md:tracking-[0.13em]">{title}</h3>
      {children}
    </section>
  );
}

function SummarySection({ summary }: { readonly summary: ReportSummaryWire }) {
  return (
    <div
      data-testid="report-summary"
      className="flex flex-col gap-8 md:gap-9"
    >
      <div>
        <h2 className="text-text text-title font-bold tracking-[-0.024em]">{summary.title}</h2>
        <p className="text-text/80 text-body mt-3 whitespace-pre-line text-pretty leading-[1.85]">
          {summary.overview}
        </p>
      </div>

      {summary.decisions.length > 0 && (
        <Section title="결정 사항">
          <ul className="text-text text-body flex flex-col gap-3 leading-relaxed">
            {summary.decisions.map((d, i) => (
              <li
                key={i}
                className="flex gap-4"
              >
                <span className="text-accent-on shrink-0 pt-0.5 font-mono text-sm font-semibold">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {summary.actionItems.length > 0 && (
        <Section title="액션 아이템">
          <ul className="text-text text-body flex flex-col gap-3">
            {summary.actionItems.map((a, i) => (
              <li
                key={i}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1"
              >
                {a.owner !== undefined && (
                  <strong className="min-w-[52px] font-bold">{a.owner}</strong>
                )}
                <span className="flex-1">{a.task}</span>
                {a.due !== undefined && (
                  <span className="text-muted font-mono text-sm">({a.due})</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {summary.keyTopics.length > 0 && (
        <Section title="핵심 토픽">
          <ul className="flex flex-col gap-6">
            {summary.keyTopics.map((t, i) => (
              <li key={i}>
                <strong className="text-text block font-bold tracking-[-0.018em]">{t.topic}</strong>
                <ul className="border-border text-text/80 text-body mt-3 flex flex-col gap-2 border-l pl-4 leading-[1.8]">
                  {t.points.map((p, j) => (
                    <li key={j}>{p}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Body({ report }: { readonly report: ReportDetailResponse }) {
  return (
    <article className="mx-auto w-full max-w-[720px]">
      <header className="border-border border-b pb-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="cap md:tracking-[0.12em]">회의록 · {report.code}</span>
          {report.pushedToNotion !== null && (
            <span className="text-accent-on text-cap shrink-0 font-mono font-semibold tracking-[0.08em]">
              NOTION 동기화됨
            </span>
          )}
        </div>
        <h1 className="text-text text-display font-extrabold tracking-[-0.038em]">
          {report.title ?? `회의록 ${report.code}`}
        </h1>
        <p className="text-muted text-meta mt-3 font-mono font-medium">
          {formatDate(report.startedAt)} ~ {formatDate(report.endedAt)}
        </p>
      </header>

      <div className="flex flex-col gap-8 pt-8 md:gap-9 md:pt-9">
        {report.summary !== null ? (
          <SummarySection summary={report.summary} />
        ) : (
          <p
            data-testid="summary-pending"
            role="status"
            aria-live="polite"
            className="text-muted text-body py-10 text-center"
          >
            요약이 진행 중입니다…
          </p>
        )}

        <div className="grid gap-8 md:grid-cols-2 md:gap-9">
          <Section
            title="참가자"
            testId="report-participants"
          >
            <ul className="flex flex-wrap gap-2.5">
              {report.participants.map((p) => (
                <li
                  key={p.id}
                  className="border-border text-text rounded-full border px-4 py-1.5 text-sm font-semibold"
                >
                  {p.nickname}
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="채팅 로그"
            testId="report-chat"
          >
            <ul className="text-text/80 flex flex-col gap-2 text-sm leading-relaxed">
              {report.chat.map((c, i) => (
                <li
                  key={i}
                  data-testid="report-chat-entry"
                >
                  <strong className="text-text font-bold">{c.nickname}</strong> {c.text}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </article>
  );
}

/**
 * 회의록 상세 페이지의 dumb View.
 *
 * ViewModel의 status 머신을 그대로 분기 렌더하고, summary/participants/chat을 각각 섹션으로 보여준다.
 * STT/요약 파이프라인이 아직 끝나지 않은(pending/processing) 상태는 "진행 중" 안내로 분기.
 */
export function ReportDetail({ status, report, errorMessage }: ReportDetailProps) {
  if (status === 'loading' || status === 'idle') {
    return (
      <p
        role="status"
        aria-live="polite"
        className="text-muted text-body py-16 text-center"
      >
        불러오는 중…
      </p>
    );
  }

  if (status === 'not-found') {
    return (
      <p
        data-testid="report-not-found"
        className="text-muted text-body py-20 text-center"
      >
        회의록을 찾을 수 없습니다.
      </p>
    );
  }

  if (status === 'error' || report === null) {
    return (
      <p
        role="alert"
        className="text-danger-on text-body py-16 text-center"
      >
        {errorMessage ?? '오류가 발생했습니다.'}
      </p>
    );
  }

  return <Body report={report} />;
}
