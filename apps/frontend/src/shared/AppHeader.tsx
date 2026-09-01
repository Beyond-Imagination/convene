'use client';

import Link from 'next/link';

export interface AppHeaderProps {
  /** 지금 보고 있는 화면. */
  readonly current?: 'reports';
}

/** 홈과 회의록이 공유하는 상단 바. */
export function AppHeader({ current }: AppHeaderProps) {
  return (
    <header className="border-border px-gutter py-gutter-sm flex items-baseline justify-between gap-4 border-b">
      <Link
        href="/"
        className="flex items-baseline gap-3 md:gap-5"
      >
        <span className="text-text text-wordmark font-extrabold tracking-[-0.038em]">Convene</span>
        <span className="text-muted text-meta hidden font-mono font-medium tracking-[0.03em] md:inline">
          for Beyond_Imagination
        </span>
      </Link>
      <Link
        href="/reports"
        className={`text-meta font-semibold transition-colors ${
          current === 'reports' ? 'text-accent-on' : 'text-muted hover:text-accent-on'
        }`}
      >
        회의록
      </Link>
    </header>
  );
}
