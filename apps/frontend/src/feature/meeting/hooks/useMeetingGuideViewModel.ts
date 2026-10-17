'use client';

import { useCallback, useEffect, useState } from 'react';

import { useMeetingGuideStore } from '@/shared/stores/meeting-guide.store';

/** 가이드가 밝힐 곳. 회의 화면의 버튼에 `data-guide` 로 단다. */
export type MeetingGuideTarget =
  | 'media'
  | 'screen-share'
  | 'reaction'
  | 'chat'
  | 'pages'
  | 'help'
  | 'leave';

export interface MeetingGuideStep {
  readonly id: MeetingGuideTarget;
  readonly title: string;
  readonly body: string;
  /** 버튼이 화면에 없을 때 건너뛰는 대신 가운데에 띄울 안내. */
  readonly whenMissing?: string;
}

export interface GuideRect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export const MEETING_GUIDE_STEPS: ReadonlyArray<MeetingGuideStep> = [
  {
    id: 'media',
    title: '마이크·카메라',
    body: '내 소리와 영상을 켜고 꺼요. 빨갛게 보이면 꺼진 상태예요.',
  },
  {
    id: 'screen-share',
    title: '화면 공유',
    body: '내 화면을 모두에게 보여 줘요. 공유된 화면은 버튼이나 휠로 확대해 볼 수 있어요.',
    whenMissing:
      '모바일 브라우저에서는 화면 공유를 시작할 수 없어요. 공유는 PC에서 해 주세요. 다른 사람이 공유한 화면은 볼 수 있고, 좌우로 넘기면 참가자와 번갈아 볼 수 있어요.',
  },
  {
    id: 'reaction',
    title: '반응·손들기',
    body: '이모지로 반응하거나 손을 들어 말할 차례를 알려요.',
  },
  {
    id: 'chat',
    title: '채팅',
    body: '회의 중에 메시지를 주고받아요. 닫혀 있을 때 새 메시지가 오면 점으로 알려 줘요.',
  },
  {
    id: 'pages',
    title: '참가자 넘겨 보기',
    body: '참가자가 한 화면에 다 들어가지 않으면 여기서 다음 페이지를 봐요.',
  },
  {
    id: 'help',
    title: '버그 리포트·설정',
    body: '문제가 생기면 여기서 알려 주세요. 화면 테마와 이 가이드는 설정에서 바꿀 수 있어요.',
  },
  {
    id: 'leave',
    title: '나가기',
    body: '나가기는 나만 회의에서 빠져요. 회의 종료는 회의를 연 사람에게만 보이고 모두의 회의를 끝내요.',
  },
];

/** 같은 표시가 여럿이면(마이크·카메라 등) 모두를 둘러싼 영역. 보이는 대상이 없으면 null. */
function measureTarget(id: MeetingGuideTarget): GuideRect | null {
  let top = Infinity;
  let left = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const el of document.querySelectorAll(`[data-guide="${id}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    top = Math.min(top, r.top);
    left = Math.min(left, r.left);
    right = Math.max(right, r.left + r.width);
    bottom = Math.max(bottom, r.top + r.height);
  }
  return top === Infinity ? null : { top, left, width: right - left, height: bottom - top };
}

export interface UseMeetingGuideViewModel {
  readonly isActive: boolean;
  readonly step: MeetingGuideStep | null;
  /** 지금 화면에 있는 단계들 안에서의 순번(0-based). */
  readonly index: number;
  readonly total: number;
  /** 밝힐 영역. 대상이 사라졌으면 null 이고 말풍선만 가운데 띄운다. */
  readonly rect: GuideRect | null;
  readonly next: () => void;
  readonly prev: () => void;
  readonly skip: () => void;
}

/**
 * 회의 화면 가이드 — 처음 한 번, 또는 설정에서 다시 켰을 때 버튼을 하나씩 밝혀 설명한다.
 * 회의에 연결된 뒤(ready), 다른 모달이 없을 때(!blocked) 시작한다.
 * 화면에 없는 버튼(한 페이지뿐인 참가자 넘기기 등)의 단계는 빼고, 모바일에 없는 화면 공유는
 * 버튼 대신 가운데에 안내를 띄운다.
 */
export function useMeetingGuideViewModel({
  ready,
  blocked,
}: {
  readonly ready: boolean;
  readonly blocked: boolean;
}): UseMeetingGuideViewModel {
  const show = useMeetingGuideStore((s) => s.showMeetingGuide);
  const isHydrated = useMeetingGuideStore((s) => s.isHydrated);
  const hydrate = useMeetingGuideStore((s) => s.hydrate);
  const setShow = useMeetingGuideStore((s) => s.setShowMeetingGuide);
  const [steps, setSteps] = useState<ReadonlyArray<MeetingGuideStep> | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<GuideRect | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!ready || blocked || !isHydrated || !show || steps !== null) return;
    const present = MEETING_GUIDE_STEPS.filter((s) => measureTarget(s.id) !== null);
    // 밝힐 버튼이 하나도 없으면 아직 회의 화면이 그려지지 않은 것이다.
    if (present.length === 0) return;
    setSteps(
      MEETING_GUIDE_STEPS.flatMap((s) => {
        if (present.includes(s)) return [s];
        return s.whenMissing === undefined ? [] : [{ ...s, body: s.whenMissing }];
      }),
    );
    setIndex(0);
  }, [ready, blocked, isHydrated, show, steps]);

  const current = steps?.[index] ?? null;

  // 창 크기가 바뀌면 버튼 위치도 바뀌므로 다시 잰다.
  useEffect(() => {
    if (current === null) return;
    const update = (): void => setRect(measureTarget(current.id));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [current]);

  const finish = useCallback(() => {
    setSteps(null);
    setShow(false);
  }, [setShow]);

  const total = steps?.length ?? 0;
  const next = useCallback(() => {
    if (index >= total - 1) finish();
    else setIndex(index + 1);
  }, [index, total, finish]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  return {
    isActive: current !== null,
    step: current,
    index,
    total,
    rect: current === null ? null : rect,
    next,
    prev,
    skip: finish,
  };
}
