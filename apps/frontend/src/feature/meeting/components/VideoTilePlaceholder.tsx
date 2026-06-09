'use client';

import { VideoOffIcon } from '@/feature/meeting/components/icons';

export interface VideoTilePlaceholderProps {
  readonly label: string;
}

/**
 * red → orange → yellow → green → cyan → blue → violet → magenta.
 */
const PALETTE = [
  { avatar: 'bg-red-600', tile: 'bg-red-950' },
  { avatar: 'bg-orange-600', tile: 'bg-orange-950' },
  { avatar: 'bg-yellow-600', tile: 'bg-yellow-950' },
  { avatar: 'bg-emerald-600', tile: 'bg-emerald-950' },
  { avatar: 'bg-cyan-600', tile: 'bg-cyan-950' },
  { avatar: 'bg-blue-600', tile: 'bg-blue-950' },
  { avatar: 'bg-violet-600', tile: 'bg-violet-950' },
  { avatar: 'bg-fuchsia-600', tile: 'bg-fuchsia-950' },
] as const;

const colorFor = (label: string): (typeof PALETTE)[number] => {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
};

/**
 * 비디오가 꺼진(또는 아직 없는) 타일을 덮는 오버레이.
 * 검은 화면 대신 닉네임 이니셜 아바타 + 카메라 OFF 아이콘을 보여준다.
 * 색은 닉네임 해시로 정해 사람마다 다르되 같은 사람은 항상 같은 색을 쓴다.
 */
export function VideoTilePlaceholder({ label }: VideoTilePlaceholderProps) {
  const initial = label.trim().charAt(0).toUpperCase() || '?';
  const color = colorFor(label);
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center gap-3 ${color.tile}`}
    >
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl font-semibold text-white ${color.avatar}`}
      >
        {initial}
      </div>
      <VideoOffIcon className="h-7 w-7 text-white/70" />
    </div>
  );
}
