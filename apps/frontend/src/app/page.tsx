'use client';

import Link from 'next/link';

import { CreateMeetingForm } from '@/feature/meeting/components/CreateMeetingForm';
import { JoinMeetingForm } from '@/feature/meeting/components/JoinMeetingForm';
import { useCreateMeetingViewModel } from '@/feature/meeting/hooks/useCreateMeetingViewModel';
import { useJoinMeetingViewModel } from '@/feature/meeting/hooks/useJoinMeetingViewModel';

/**
 * 홈 페이지. v1 단계에서는 세 액션만 노출:
 *   - 회의 생성 (CreateMeetingForm): 버튼 한 번에 새 회의를 만들고 입장
 *   - 회의 입장 (JoinMeetingForm): 기존 회의 코드 + 닉네임으로 입장
 *   - 회의록 보기 (/reports 링크): 지난 회의의 회의록 목록으로 이동
 *
 * Next.js 정적 export 호환을 위해 client component 로 두고(ARCHITECTURE §4.3),
 * ViewModel hook 의 반환을 View 컴포넌트에 props 로 전달한다.
 */
export default function HomePage() {
  const createVm = useCreateMeetingViewModel();
  const joinVm = useJoinMeetingViewModel();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <div className="inline-flex items-center gap-2">
            <span className="inline-block h-7 w-7 rounded-full bg-accent" aria-hidden />
            <span className="text-2xl font-extrabold tracking-tight text-text">
              Convene
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">
            링크 하나로 시작하는 화상회의 · 채팅 · 회의록
          </p>
        </header>

        <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <CreateMeetingForm {...createVm} />
        </section>

        <div className="my-6 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-border" />
          또는
          <span className="h-px flex-1 bg-border" />
        </div>

        <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <JoinMeetingForm {...joinVm} />
        </section>

        <nav className="mt-8 text-center">
          <Link
            href="/reports"
            className="text-sm font-medium text-muted transition-colors hover:text-accent"
          >
            지난 회의록 보기 →
          </Link>
        </nav>
      </div>
    </main>
  );
}
