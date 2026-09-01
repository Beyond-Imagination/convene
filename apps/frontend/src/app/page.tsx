'use client';

import { CreateMeetingForm } from '@/feature/meeting/components/CreateMeetingForm';
import { JoinMeetingForm } from '@/feature/meeting/components/JoinMeetingForm';
import { useCreateMeetingViewModel } from '@/feature/meeting/hooks/useCreateMeetingViewModel';
import { useJoinMeetingViewModel } from '@/feature/meeting/hooks/useJoinMeetingViewModel';
import { AppHeader } from '@/shared/AppHeader';

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
      <AppHeader />

      <main className="grid flex-1 md:grid-cols-2">
        <section className="border-border px-gutter py-panel-y flex flex-col justify-center border-b md:max-w-[760px] md:border-b-0 md:border-r">
          <CreateMeetingForm {...createVm} />
        </section>
        <section className="px-gutter py-panel-y flex flex-col justify-center md:max-w-[760px]">
          <JoinMeetingForm {...joinVm} />
        </section>
      </main>
    </div>
  );
}
