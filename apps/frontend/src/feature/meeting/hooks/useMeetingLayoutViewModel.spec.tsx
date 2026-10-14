import { act, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import {
  fitGrid,
  gridCapacity,
  stripCapacity,
  useHorizontalSwipe,
  useMeetingLayoutViewModel,
} from './useMeetingLayoutViewModel';

const setWidth = (width: number): void => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
};

describe('useMeetingLayoutViewModel', () => {
  it('웹에서는 채팅 패널이 열린 채로 시작한다', () => {
    setWidth(1280);
    const { result } = renderHook(() => useMeetingLayoutViewModel());
    expect(result.current.isChatOpen).toBe(true);
  });

  it('모바일에서는 채팅이 화면을 덮으므로 닫힌 채로 시작한다', () => {
    setWidth(390);
    const { result } = renderHook(() => useMeetingLayoutViewModel());
    expect(result.current.isChatOpen).toBe(false);
  });

  it('toggleChat을 호출하면 열림/닫힘이 반전된다', () => {
    setWidth(1280);
    const { result } = renderHook(() => useMeetingLayoutViewModel());
    act(() => result.current.toggleChat());
    expect(result.current.isChatOpen).toBe(false);
    act(() => result.current.toggleChat());
    expect(result.current.isChatOpen).toBe(true);
  });

  it('채팅 미읽음은 없음으로 시작하고 setHasUnreadChat으로 바뀐다', () => {
    const { result } = renderHook(() => useMeetingLayoutViewModel());
    expect(result.current.hasUnreadChat).toBe(false);
    act(() => result.current.setHasUnreadChat(true));
    expect(result.current.hasUnreadChat).toBe(true);
  });
});

describe('useMeetingLayoutViewModel - 비디오 페이지네이션', () => {
  // pageSize는 뷰포트 너비에 따라 달라지므로 런타임 값을 읽어 검증한다.
  it('타일 수가 pageSize 이하면 페이지는 1개이고 이동 불가', () => {
    const { result, rerender } = renderHook(
      ({ n }: { n: number }) => useMeetingLayoutViewModel(n),
      { initialProps: { n: 0 } },
    );
    const size = result.current.pageSize;
    rerender({ n: Math.max(1, size - 1) });
    expect(result.current.page).toBe(0);
    expect(result.current.pageCount).toBe(1);
    expect(result.current.canPrev).toBe(false);
    expect(result.current.canNext).toBe(false);
  });

  it('타일 수가 pageSize를 넘으면 다음/이전 페이지로 이동할 수 있다', () => {
    const { result, rerender } = renderHook(
      ({ n }: { n: number }) => useMeetingLayoutViewModel(n),
      { initialProps: { n: 0 } },
    );
    const size = result.current.pageSize;
    rerender({ n: size + 1 }); // 한 페이지 초과 → 2 페이지
    expect(result.current.pageCount).toBe(2);
    expect(result.current.canNext).toBe(true);
    expect(result.current.canPrev).toBe(false);
    act(() => result.current.nextPage());
    expect(result.current.page).toBe(1);
    expect(result.current.canNext).toBe(false);
    expect(result.current.canPrev).toBe(true);
    act(() => result.current.prevPage());
    expect(result.current.page).toBe(0);
  });

  it('타일이 줄어 현재 페이지가 범위를 벗어나면 마지막 페이지로 보정된다', () => {
    const { result, rerender } = renderHook(
      ({ n }: { n: number }) => useMeetingLayoutViewModel(n),
      { initialProps: { n: 0 } },
    );
    const size = result.current.pageSize;
    rerender({ n: size * 2 + 1 }); // 3 페이지
    act(() => result.current.nextPage());
    act(() => result.current.nextPage());
    expect(result.current.page).toBe(2);
    rerender({ n: size }); // 1 페이지로 축소
    expect(result.current.page).toBe(0);
    expect(result.current.pageCount).toBe(1);
  });
});

describe('useMeetingLayoutViewModel - 배치 variant', () => {
  it('넓은 뷰포트는 desktop 배치에 한 페이지 9칸이다', () => {
    setWidth(1280);
    const { result } = renderHook(() => useMeetingLayoutViewModel(0));
    expect(result.current.variant).toBe('desktop');
    expect(result.current.pageSize).toBe(9);
  });

  it('좁은 뷰포트는 mobile 배치에 한 페이지 4칸이다', () => {
    setWidth(390);
    const { result } = renderHook(() => useMeetingLayoutViewModel(0));
    expect(result.current.variant).toBe('mobile');
    expect(result.current.pageSize).toBe(4);
  });

  it('참가자 줄은 웹에서 펼침, 모바일에서 접힘으로 시작한다', () => {
    setWidth(1280);
    expect(renderHook(() => useMeetingLayoutViewModel(0)).result.current.isStripOpen).toBe(true);
    setWidth(390);
    expect(renderHook(() => useMeetingLayoutViewModel(0)).result.current.isStripOpen).toBe(false);
  });

  it('toggleStrip으로 뒤집은 선택이 유지된다', () => {
    setWidth(1280);
    const { result } = renderHook(() => useMeetingLayoutViewModel(0));
    act(() => result.current.toggleStrip());
    expect(result.current.isStripOpen).toBe(false);
    act(() => result.current.toggleStrip());
    expect(result.current.isStripOpen).toBe(true);
  });
});

describe('fitGrid', () => {
  it('넓고 낮은 영역에서는 한 줄로 편다', () => {
    expect(fitGrid(1200, 200, 3, 16 / 9, 14).cols).toBe(3);
  });

  it('좁고 높은 영역에서는 한 열로 쌓는다', () => {
    expect(fitGrid(300, 900, 3, 16 / 9, 14).cols).toBe(1);
  });

  it.each([
    [900, 600, 9],
    [640, 360, 5],
    [1400, 300, 7],
    [358, 520, 4],
  ])('%i×%i 영역에 %i칸을 비율을 지키며 넘치지 않게 담는다', (w, h, n) => {
    const { cols, tileWidth, tileHeight } = fitGrid(w, h, n, 16 / 9, 14);
    const rows = Math.ceil(n / cols);
    expect(cols * tileWidth + (cols - 1) * 14).toBeLessThanOrEqual(w + 0.5);
    expect(rows * tileHeight + (rows - 1) * 14).toBeLessThanOrEqual(h + 0.5);
    expect(tileWidth / tileHeight).toBeCloseTo(16 / 9, 1);
  });
});

describe('gridCapacity', () => {
  it('영역이 충분하면 상한까지 담는다', () => {
    expect(gridCapacity(1200, 700, 'desktop')).toBe(9);
    expect(gridCapacity(800, 800, 'mobile')).toBe(4);
  });

  it('영역이 낮으면 최소 폭을 지키는 만큼으로 줄인다', () => {
    expect(gridCapacity(900, 180, 'desktop')).toBe(5);
  });

  it('최소 폭을 못 지켜도 한 칸은 남긴다', () => {
    expect(gridCapacity(100, 50, 'desktop')).toBe(1);
  });
});

describe('stripCapacity', () => {
  it('타일이 다 들어가면 버튼 자리를 빼지 않는다', () => {
    expect(stripCapacity(2000, 3)).toBe(8);
  });

  it('넘치면 양 끝 페이지 버튼 자리를 빼고 담는다', () => {
    expect(stripCapacity(1000, 9)).toBe(3);
  });

  it('상한을 넘지 않고, 좁아도 한 칸은 남긴다', () => {
    expect(stripCapacity(5000, 12)).toBe(9);
    expect(stripCapacity(100, 5)).toBe(1);
  });
});

describe('useMeetingLayoutViewModel - 영역 측정', () => {
  let observed: (() => void) | null = null;

  beforeEach(() => {
    observed = null;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          observed = cb;
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  const areaOf = (width: number, height: number): HTMLDivElement => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ width, height }) as DOMRect;
    return el;
  };

  it('측정한 영역에 맞춰 한 페이지 타일 수와 타일 크기를 정한다', () => {
    setWidth(1280);
    const { result } = renderHook(() => useMeetingLayoutViewModel(12));
    act(() => result.current.tileAreaRef(areaOf(900, 180)));
    expect(result.current.pageSize).toBe(5);
    expect(result.current.tileSize?.width).toBeGreaterThanOrEqual(160);
  });

  it('영역 크기가 바뀌면 다시 계산한다', () => {
    setWidth(1280);
    const { result } = renderHook(() => useMeetingLayoutViewModel(12));
    const el = areaOf(900, 180);
    act(() => result.current.tileAreaRef(el));
    el.getBoundingClientRect = () => ({ width: 1200, height: 700 }) as DOMRect;
    act(() => observed?.());
    expect(result.current.pageSize).toBe(9);
  });

  it('화면 공유 중에는 참가자 줄 폭으로 정한다', () => {
    setWidth(1280);
    const { result } = renderHook(() => useMeetingLayoutViewModel(12, true));
    act(() => result.current.tileAreaRef(areaOf(1000, 133)));
    expect(result.current.pageSize).toBe(3);
  });

  it('숨겨진(크기 0) 영역은 무시하고 직전 측정을 유지한다', () => {
    setWidth(1280);
    const { result } = renderHook(() => useMeetingLayoutViewModel(12));
    const el = areaOf(900, 180);
    act(() => result.current.tileAreaRef(el));
    el.getBoundingClientRect = () => ({ width: 0, height: 0 }) as DOMRect;
    act(() => observed?.());
    expect(result.current.pageSize).toBe(5);
  });
});

describe('useMeetingLayoutViewModel - 모바일', () => {
  beforeEach(() => {
    setWidth(390);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  const areaOf = (width: number, height: number): HTMLDivElement => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ width, height }) as DOMRect;
    return el;
  };

  it('세 칸 이상이면 2열(2×2)로 놓는다', () => {
    const { result } = renderHook(() => useMeetingLayoutViewModel(4));
    act(() => result.current.tileAreaRef(areaOf(343, 700)));
    expect(result.current.pageSize).toBe(4);
    expect(result.current.tileSize?.width).toBe(167);
  });

  it('데스크톱 공유는 하단 참가자 줄로 보여 준다', () => {
    setWidth(1280);
    const { result } = renderHook(() => useMeetingLayoutViewModel(4, true));
    expect(result.current.shareView).toBe('strip');
  });

  it('모바일 공유는 공유 화면부터 보여 주고, 다음으로 넘기면 참가자 그리드가 나온다', () => {
    const { result } = renderHook(() => useMeetingLayoutViewModel(4, true));
    expect(result.current.shareView).toBe('screen');
    expect(result.current.canPrev).toBe(false);
    expect(result.current.canNext).toBe(true);
    act(() => result.current.nextPage());
    expect(result.current.shareView).toBe('participants');
    expect(result.current.page).toBe(0);
    expect(result.current.canPrev).toBe(true);
    act(() => result.current.prevPage());
    expect(result.current.shareView).toBe('screen');
  });

  it('모바일 공유 중 참가자 페이지는 그리드 기준으로 나눈다', () => {
    const { result } = renderHook(() => useMeetingLayoutViewModel(12, true));
    act(() => result.current.tileAreaRef(areaOf(343, 700)));
    expect(result.current.pageSize).toBe(4);
    act(() => result.current.nextPage());
    act(() => result.current.nextPage());
    expect(result.current.shareView).toBe('participants');
    expect(result.current.page).toBe(1);
  });

  it('공유가 끝났다 다시 시작되면 공유 화면부터 보여 준다', () => {
    const { result, rerender } = renderHook(
      ({ sharing }: { sharing: boolean }) => useMeetingLayoutViewModel(4, sharing),
      { initialProps: { sharing: true } },
    );
    act(() => result.current.nextPage());
    rerender({ sharing: false });
    rerender({ sharing: true });
    expect(result.current.shareView).toBe('screen');
  });
});

describe('useHorizontalSwipe', () => {
  const pointer = (clientX: number, clientY = 0, target: Element = document.body) =>
    ({ clientX, clientY, target }) as unknown as ReactPointerEvent;

  const setup = () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const { result } = renderHook(() => useHorizontalSwipe(onPrev, onNext));
    const swipe = (from: ReactPointerEvent, to: ReactPointerEvent): void => {
      act(() => {
        result.current.onPointerDown(from);
        result.current.onPointerUp(to);
      });
    };
    return { onPrev, onNext, swipe };
  };

  it('왼쪽으로 쓸면 다음, 오른쪽으로 쓸면 이전으로 간다', () => {
    const { onPrev, onNext, swipe } = setup();
    swipe(pointer(300), pointer(200));
    expect(onNext).toHaveBeenCalledTimes(1);
    swipe(pointer(100), pointer(220));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('짧게 움직이거나 세로로 쓸면 넘기지 않는다', () => {
    const { onPrev, onNext, swipe } = setup();
    swipe(pointer(300), pointer(280));
    swipe(pointer(300, 0), pointer(200, 200));
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });

  it('data-no-swipe 안에서 시작한 드래그는 무시한다', () => {
    const { onNext, swipe } = setup();
    const panLayer = document.createElement('div');
    panLayer.dataset.noSwipe = '';
    const child = document.createElement('span');
    panLayer.appendChild(child);
    swipe(pointer(300, 0, child), pointer(100, 0, child));
    expect(onNext).not.toHaveBeenCalled();
  });
});
