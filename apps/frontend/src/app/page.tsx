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
    <main>
      <h1>migration v1.0.0</h1>
      <CreateMeetingForm {...createVm} />
      <JoinMeetingForm {...joinVm} />
      <nav>
        <Link href="/reports">회의록 보기</Link>
      </nav>
    </main>
  );
}
