/*
 * 회의 컨트롤 바용 인라인 SVG 아이콘 모음. 모두 24x24 stroke 기반.
 * 버튼의 접근성 이름은 별도 텍스트 라벨이 담당하므로 아이콘 자체는 aria-hidden으로 둔다.
 */

type IconProps = { readonly className?: string };

const base = (className?: string) => ({
  className,
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export function MicIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect
        x="9"
        y="2"
        width="6"
        height="12"
        rx="3"
      />
      <path d="M5 10a7 7 0 0 0 14 0M12 19v3" />
    </svg>
  );
}

export function MicOffIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M9 9v-4a3 3 0 0 1 5.5-1.5M15 9.3V4M5 10a7 7 0 0 0 10.7 6M19 10a7 7 0 0 1-.3 2M12 19v3" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

export function VideoIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect
        x="2"
        y="6"
        width="13"
        height="12"
        rx="2"
      />
      <path d="M22 8l-7 4 7 4V8z" />
    </svg>
  );
}

export function VideoOffIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

export function ScreenShareIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect
        x="2"
        y="3"
        width="20"
        height="14"
        rx="2"
      />
      <path d="M8 21h8M12 17v4M12 7v5M9.5 9.5 12 7l2.5 2.5" />
    </svg>
  );
}

export function ChatIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
    </svg>
  );
}

export function LeaveIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

export function EndCallIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 10.5c5.5-4 12-4 18 0v3l-3.5.5-.7-2.6a13 13 0 0 0-9.6 0L6.5 14 3 13.5z" />
    </svg>
  );
}

export function LinkIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
