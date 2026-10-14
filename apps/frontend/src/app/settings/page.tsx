import { SettingsPanel } from '@/feature/settings/components/SettingsPanel';
import { AppHeader } from '@/shared/AppHeader';

/** `/settings` — 기기에 저장되는 개인 설정. 회의 중에는 같은 내용을 모달로 연다. */
export default function SettingsPage() {
  return (
    <div className="bg-paper flex min-h-screen flex-col">
      <AppHeader current="settings" />

      <main className="px-gutter py-panel-y flex flex-1 flex-col">
        <div className="flex w-full max-w-xl flex-col gap-8">
          <h1 className="text-display text-text font-extrabold tracking-[-0.03em]">설정</h1>
          <SettingsPanel />
        </div>
      </main>
    </div>
  );
}
