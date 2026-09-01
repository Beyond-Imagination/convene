'use client';

import Link from 'next/link';

import { CreateMeetingForm } from '@/feature/meeting/components/CreateMeetingForm';
import { JoinMeetingForm } from '@/feature/meeting/components/JoinMeetingForm';
import { useCreateMeetingViewModel } from '@/feature/meeting/hooks/useCreateMeetingViewModel';
import { useJoinMeetingViewModel } from '@/feature/meeting/hooks/useJoinMeetingViewModel';

/**
 * 홈 페이지. 세 액션을 노출:
 *   - 회의 생성 (CreateMeetingForm): 버튼 한 번에 새 회의를 만들고 입장
 *   - 회의 입장 (JoinMeetingForm): 기존 회의 코드 + 닉네임으로 입장
 *   - 회의록 보기 (/reports 링크): 지난 회의의 회의록 목록으로 이동
 *
 * Next.js 정적 export 호환을 위해 client component로 두고, ViewModel hook의 반환을 View 컴포넌트에 props로 전달한다.
 */
export default function HomePage() {
  const createVm = useCreateMeetingViewModel();
  const joinVm = useJoinMeetingViewModel();
  return (
    <div className="bg-paper flex min-h-screen flex-col">
      <header className="border-border flex items-baseline justify-between gap-4 border-b px-5 pb-3.5 pt-11 md:px-16 md:pb-7 md:pt-8">
        <div className="flex items-baseline gap-3 md:gap-5">
          <span className="text-text text-2xl font-extrabold tracking-[-0.035em] md:text-4xl md:tracking-[-0.038em]">
            Convene
          </span>
          <span className="text-muted hidden font-mono text-base font-medium tracking-[0.03em] md:inline">
            for Beyond_Imagination
          </span>
        </div>
        <Link
          href="/reports"
          className="text-muted hover:text-accent-on text-[13px] font-semibold transition-colors md:text-[17px]"
        >
          회의록
        </Link>
      </header>

      <main className="grid flex-1 md:grid-cols-2">
        <section className="border-border flex flex-col justify-center border-b px-5 py-5 md:max-w-[760px] md:border-b-0 md:border-r md:px-16 md:py-[70px]">
          <CreateMeetingForm {...createVm} />
        </section>
        <section className="flex flex-col justify-center px-5 py-5 md:max-w-[760px] md:px-16 md:py-[70px]">
          <JoinMeetingForm {...joinVm} />
        </section>
      </main>
    </div>
  );
}
