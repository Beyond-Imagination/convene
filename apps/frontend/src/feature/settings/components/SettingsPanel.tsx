'use client';

import { type ReactNode, useId } from 'react';

import { useSettingsViewModel } from '@/feature/settings/hooks/useSettingsViewModel';
import type { ThemePreference } from '@/shared/stores/theme.store';

const icon = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function SunIcon() {
  return (
    <svg {...icon}>
      <circle
        cx="12"
        cy="12"
        r="4"
      />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg {...icon}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg {...icon}>
      <rect
        x="2"
        y="3"
        width="20"
        height="14"
        rx="2"
      />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

const THEME_OPTIONS: ReadonlyArray<{
  readonly value: ThemePreference;
  readonly label: string;
  readonly icon: ReactNode;
  /** `<html data-theme-pref>` 가 이 값일 때 칠한다(theme.store 참고). */
  readonly selectedClass: string;
}> = [
  {
    value: 'light',
    label: '라이트',
    icon: <SunIcon />,
    selectedClass:
      '[[data-theme-pref=light]_&]:bg-accent [[data-theme-pref=light]_&]:text-accent-fg',
  },
  {
    value: 'dark',
    label: '다크',
    icon: <MoonIcon />,
    selectedClass: '[[data-theme-pref=dark]_&]:bg-accent [[data-theme-pref=dark]_&]:text-accent-fg',
  },
  {
    value: 'system',
    label: '시스템',
    icon: <MonitorIcon />,
    selectedClass:
      '[[data-theme-pref=system]_&]:bg-accent [[data-theme-pref=system]_&]:text-accent-fg',
  },
];

/** 설정 한 줄 — 왼쪽에 이름·설명, 오른쪽에 컨트롤. 항목이 늘어도 같은 모양으로 쌓인다. */
function SettingRow({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: (labelId: string) => ReactNode;
}) {
  const labelId = useId();
  return (
    <div className="border-border flex items-center justify-between gap-6 border-b py-4 last:border-b-0">
      <div className="min-w-0">
        <div
          id={labelId}
          className="text-body text-text font-semibold"
        >
          {title}
        </div>
        {description !== undefined && <p className="text-muted text-meta mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children(labelId)}</div>
    </div>
  );
}

/** 아이콘만 보이고 이름은 툴팁으로 — 툴팁 글자가 곧 라디오의 접근성 이름이다. */
export function ThemeSetting({
  value,
  onChange,
}: {
  readonly value: ThemePreference;
  readonly onChange: (value: ThemePreference) => void;
}) {
  return (
    <SettingRow
      title="화면 테마"
      description="시스템은 기기의 라이트/다크 설정을 따릅니다."
    >
      {(labelId) => (
        <div
          role="radiogroup"
          aria-labelledby={labelId}
          className="border-border bg-surface flex gap-0.5 rounded-xl border p-1"
        >
          {THEME_OPTIONS.map((o) => (
            <label
              key={o.value}
              className="group relative"
            >
              <input
                type="radio"
                name="theme"
                value={o.value}
                checked={value === o.value}
                onChange={() => onChange(o.value)}
                className="peer sr-only"
              />
              <span
                className={`text-muted group-hover:text-text peer-focus-visible:ring-accent grid h-9 w-9 cursor-pointer place-items-center rounded-lg peer-focus-visible:ring-2 ${o.selectedClass}`}
              >
                {o.icon}
              </span>
              <span
                role="tooltip"
                className="bg-text text-paper text-cap pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 font-semibold opacity-0 transition-opacity group-hover:opacity-100 peer-focus-visible:opacity-100"
              >
                {o.label}
              </span>
            </label>
          ))}
        </div>
      )}
    </SettingRow>
  );
}

/** 설정 페이지와 회의 중 설정 모달이 같은 내용을 보여 준다. 항목이 늘면 여기에 줄을 더한다. */
export function SettingsPanel() {
  const vm = useSettingsViewModel();
  return (
    <div className="flex flex-col">
      <ThemeSetting
        value={vm.theme}
        onChange={vm.setTheme}
      />
    </div>
  );
}

/** 회의를 떠나지 않고 설정을 바꾸는 모달. */
export function SettingsDialog({
  isOpen,
  onClose,
}: {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="settings-backdrop"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/45"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
        className="border-border bg-paper relative flex w-full max-w-md flex-col gap-6 rounded-2xl border p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] md:p-8"
      >
        <div className="flex items-center justify-between">
          <h2
            id="settings-dialog-title"
            className="text-title text-text font-bold"
          >
            설정
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="설정 닫기"
            // 열리자마자 포커스를 안으로 옮겨 Escape 와 Tab 이 모달에서 시작하게 한다.
            autoFocus
            className="text-muted hover:bg-text/10 hover:text-text grid h-9 w-9 place-items-center rounded-full text-xl transition-colors"
          >
            ×
          </button>
        </div>
        <SettingsPanel />
      </div>
    </div>
  );
}
