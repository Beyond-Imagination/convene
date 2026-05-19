'use client';

import type {
  ReportDetailResponse,
  ReportSummaryWire,
} from '@migration/shared-interfaces';

import type { UseReportDetailViewModel } from '@/feature/reports/hooks/useReportDetailViewModel';

/**
 * 회의록 상세 페이지의 dumb View.
 *
 * ViewModel 의 status 머신을 그대로 분기 렌더하고, summary / participants / chat /
 * transcript 를 각각 섹션으로 보여준다. 미구현 단계(STT/요약 pipeline) 는
 * "진행 중" 안내로 분기.
 */
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
    <section data-testid="report-summary">
      <h2>{summary.title}</h2>
      <p>{summary.overview}</p>

      {summary.decisions.length > 0 && (
        <section>
          <h3>결정 사항</h3>
          <ul>
            {summary.decisions.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </section>
      )}

      {summary.actionItems.length > 0 && (
        <section>
          <h3>액션 아이템</h3>
          <ul>
            {summary.actionItems.map((a, i) => (
              <li key={i}>
                {a.owner !== undefined && <strong>{a.owner}: </strong>}
                <span>{a.task}</span>
                {a.due !== undefined && <em> ({a.due})</em>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.keyTopics.length > 0 && (
        <section>
          <h3>핵심 토픽</h3>
          <ul>
            {summary.keyTopics.map((t, i) => (
              <li key={i}>
                <strong>{t.topic}</strong>
                <ul>
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
    <article>
      <header>
        <h1>회의록 {report.code}</h1>
        <p>
          {formatDate(report.startedAt)} ~ {formatDate(report.endedAt)}
        </p>
      </header>

      {report.summary !== null ? (
        <SummarySection summary={report.summary} />
      ) : (
        <p data-testid="summary-pending" role="status" aria-live="polite">
          요약이 진행 중입니다…
        </p>
      )}

      <section data-testid="report-participants" aria-labelledby="participants-heading">
        <h2 id="participants-heading">참가자</h2>
        <ul>
          {report.participants.map((p) => (
            <li key={p.id}>{p.nickname}</li>
          ))}
        </ul>
      </section>

      <section data-testid="report-chat" aria-labelledby="chat-heading">
        <h2 id="chat-heading">채팅 로그</h2>
        <ul>
          {report.chat.map((c, i) => (
            <li key={i} data-testid="report-chat-entry">
              <strong>{c.nickname}</strong>: <span>{c.text}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

export function ReportDetail({ status, report, errorMessage }: ReportDetailProps) {
  if (status === 'loading' || status === 'idle') {
    return (
      <p role="status" aria-live="polite">
        불러오는 중…
      </p>
    );
  }

  if (status === 'not-found') {
    return (
      <p data-testid="report-not-found">회의록을 찾을 수 없습니다.</p>
    );
  }

  if (status === 'error' || report === null) {
    return (
      <p role="alert">{errorMessage ?? '오류가 발생했습니다.'}</p>
    );
  }

  return <Body report={report} />;
}
