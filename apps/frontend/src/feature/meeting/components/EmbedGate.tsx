'use client';

export interface EmbedGateProps {
  readonly code: string;
  readonly pageUrl: string;
}

/**
 * 노션 등 다른 페이지에 iframe으로 삽입됐을 때 회의 대신 보여주는 진입 View.
 *
 * 임베드하는 쪽이 `allow="camera; microphone"`을 주지 않으면 브라우저가 마이크·카메라를
 * 차단하므로(노션 embed가 그렇다) 회의를 열지 않고 새 탭으로 넘긴다.
 */
export function EmbedGate({ code, pageUrl }: EmbedGateProps) {
  return (
    <div className="theme-dark bg-bg text-text flex min-h-screen items-center justify-center p-6">
      <div className="border-border bg-surface w-full max-w-sm rounded-2xl border p-6 text-center shadow-xl">
        <h2 className="text-text text-lg font-bold">회의 참가</h2>
        <p className="text-muted mt-1 text-sm">
          삽입된 화면에서는 마이크와 카메라를 사용할 수 없습니다. 새 탭에서 열어 참가해 주세요.
        </p>
        <p className="text-text mt-4 font-mono text-2xl font-bold tracking-widest">{code}</p>
        <a
          href={pageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary mt-4 w-full"
        >
          새 탭에서 참가하기
        </a>
      </div>
    </div>
  );
}
