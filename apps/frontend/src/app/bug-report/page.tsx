import { BugReportPanel } from '@/feature/bug-report/components/BugReportPanel';
import { AppHeader } from '@/shared/AppHeader';

/** `/bug-report` — 겪은 문제를 노션 이슈(유형=버그)로 접수한다. 회의 중에는 같은 양식을 모달로 연다. */
export default function BugReportPage() {
  return (
    <div className="bg-paper flex min-h-screen flex-col">
      <AppHeader current="bug-report" />

      <main className="px-gutter py-panel-y flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-display text-text font-extrabold tracking-[-0.03em]">
              버그 리포트
            </h1>
            <p className="text-muted text-body">
              겪은 문제를 알려 주세요. 노션 이슈로 등록돼 팀이 확인합니다.
            </p>
          </div>
          <BugReportPanel />
        </div>
      </main>
    </div>
  );
}
