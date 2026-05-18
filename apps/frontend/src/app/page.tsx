'use client';

import { CreateMeetingForm } from '@/feature/meeting/components/CreateMeetingForm';
import { useCreateMeetingViewModel } from '@/feature/meeting/hooks/useCreateMeetingViewModel';

/**
 * 홈 페이지. v1 마이그레이션 단계에서는 회의 생성 단일 액션만 노출한다.
 *
 * Next.js 정적 export 호환을 위해 client component 로 두고(ARCHITECTURE §4.3),
 * ViewModel hook 의 반환을 View 컴포넌트에 props 로 전달한다.
 */
export default function HomePage() {
  const vm = useCreateMeetingViewModel();
  return (
    <main>
      <h1>migration v1.0.0</h1>
      <CreateMeetingForm
        status={vm.status}
        errorMessage={vm.errorMessage}
        onSubmit={vm.submit}
      />
    </main>
  );
}
