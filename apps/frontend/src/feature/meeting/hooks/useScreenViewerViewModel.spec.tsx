import { act, render, screen } from '@testing-library/react';

import { type UseScreenViewerViewModel, useScreenViewerViewModel } from './useScreenViewerViewModel';

const setup = (stageW = 960, stageH = 540) => {
  let vm: UseScreenViewerViewModel | null = null;
  function Harness() {
    vm = useScreenViewerViewModel();
    return (
      <div
        ref={vm.stageRef}
        data-testid="stage"
      >
        <video data-testid="video" />
      </div>
    );
  }
  render(<Harness />);
  const stage = screen.getByTestId('stage');
  const video = screen.getByTestId('video') as HTMLVideoElement;
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: stageW,
    bottom: stageH,
    width: stageW,
    height: stageH,
    toJSON: () => ({}),
  });
  const setSource = (w: number, h: number): void => {
    Object.defineProperty(video, 'videoWidth', { value: w, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: h, configurable: true });
  };
  const current = (): UseScreenViewerViewModel => {
    if (vm === null) throw new Error('Harness 미렌더');
    return vm;
  };
  const pointer = (pointerId: number, clientX: number, clientY: number) => ({
    pointerId,
    clientX,
    clientY,
    currentTarget: stage,
  });
  return { current, stage, video, setSource, pointer };
};

const setFullscreenSupport = (enabled: boolean): void => {
  Object.defineProperty(document, 'fullscreenEnabled', { value: enabled, configurable: true });
};

const setFullscreenElement = (el: Element | null): void => {
  Object.defineProperty(document, 'fullscreenElement', { value: el, configurable: true });
  document.dispatchEvent(new Event('fullscreenchange'));
};

afterEach(() => {
  act(() => setFullscreenElement(null));
});

describe('useScreenViewerViewModel - 보기 옵션', () => {
  it('창에 맞춤으로 시작하고 메뉴는 닫혀 있다', () => {
    const { current } = setup();
    expect(current().scale).toBe('fit');
    expect(current().zoom).toBe(1);
    expect(current().isMenuOpen).toBe(false);
  });

  it('메뉴를 열고 배율을 고르면 메뉴가 닫힌다', () => {
    const { current } = setup();
    act(() => current().toggleMenu());
    expect(current().isMenuOpen).toBe(true);
    act(() => current().setScale(1.5));
    expect(current().scale).toBe(1.5);
    expect(current().isMenuOpen).toBe(false);
  });

  it('closeMenu는 고른 배율을 바꾸지 않고 메뉴만 닫는다', () => {
    const { current } = setup();
    act(() => current().toggleMenu());
    act(() => current().closeMenu());
    expect(current().isMenuOpen).toBe(false);
    expect(current().scale).toBe('fit');
  });

  it('퍼센트는 공유 화면의 원본 해상도 기준이다 — 1920px 원본을 960px stage에서 100%로 보면 2배', () => {
    const { current, setSource } = setup(960, 540);
    setSource(1920, 1080);
    act(() => current().setScale(1));
    expect(current().zoom).toBe(2);
    act(() => current().setScale(0.5));
    expect(current().zoom).toBe(1);
  });

  it('원본이 stage보다 작으면 100%는 맞춤보다 작게 보인다', () => {
    const { current, setSource } = setup(1920, 1080);
    setSource(1280, 720);
    act(() => current().setScale(1));
    expect(current().zoom).toBeCloseTo(2 / 3);
    expect(current().canPan).toBe(false);
  });

  it('화면 채우기는 빈 띠 없이 stage를 채우고, 잘린 쪽으로만 옮길 수 있다', () => {
    const { current, setSource, pointer } = setup(960, 540);
    setSource(1920, 1200); // 16:10 원본 → 16:9 stage 에서 위아래가 넘친다
    act(() => current().setScale('fill'));
    expect(current().zoom).toBeCloseTo(10 / 9); // 맞춤 0.45 → 채움 0.5
    act(() => current().onPointerDown(pointer(1, 0, 0)));
    act(() => current().onPointerMove(pointer(1, 500, 500)));
    expect(current().panX).toBe(0);
    expect(current().panY).toBe(30);
  });

  it('원본 해상도를 아직 모르면 맞춤 크기로 둔다', () => {
    const { current } = setup();
    act(() => current().setScale(2));
    expect(current().zoom).toBe(1);
  });

  it('공유 화면 해상도가 바뀌면 배율을 다시 계산한다', () => {
    const { current, video, setSource } = setup(960, 540);
    setSource(1920, 1080);
    act(() => current().setScale(1));
    setSource(960, 540);
    act(() => {
      video.dispatchEvent(new Event('resize'));
    });
    expect(current().zoom).toBe(1);
  });

  it('맞춤으로 돌아오면 이동이 초기화된다', () => {
    const { current, setSource, pointer } = setup(960, 540);
    setSource(1920, 1080);
    act(() => current().setScale(2));
    act(() => current().onPointerDown(pointer(1, 0, 0)));
    act(() => current().onPointerMove(pointer(1, 100, 50)));
    act(() => current().onPointerUp(pointer(1, 100, 50)));
    act(() => current().setScale('fit'));
    expect(current().panX).toBe(0);
    expect(current().panY).toBe(0);
  });
});

describe('useScreenViewerViewModel - 확대·축소 버튼과 휠', () => {
  const wheel = (stage: HTMLElement, init: WheelEventInit): WheelEvent => {
    const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
    // happy-dom 의 WheelEvent 는 좌표 init 을 무시한다.
    Object.defineProperty(e, 'clientX', { value: init.clientX ?? 0 });
    Object.defineProperty(e, 'clientY', { value: init.clientY ?? 0 });
    act(() => {
      stage.dispatchEvent(e);
    });
    return e;
  };

  it('확대 버튼은 지금보다 큰 다음 단계로 간다 — 맞춤(원본 50%)에서 100%', () => {
    const { current, setSource } = setup(960, 540);
    setSource(1920, 1080);
    act(() => current().zoomIn());
    expect(current().scale).toBe(1);
    expect(current().zoom).toBe(2);
  });

  it('축소는 원본 50%와 맞춤 중 작은 쪽 아래로 내려가지 않는다', () => {
    const { current, setSource } = setup(960, 540);
    setSource(1920, 1080);
    act(() => current().setScale(1));
    act(() => current().zoomOut());
    expect(current().scale).toBe(0.5);
    expect(current().canZoomOut).toBe(false);
    act(() => current().zoomOut());
    expect(current().scale).toBe(0.5);
  });

  it('300%가 최대다', () => {
    const { current, setSource } = setup(960, 540);
    setSource(1920, 1080);
    act(() => current().setScale(3));
    expect(current().canZoomIn).toBe(false);
    act(() => current().zoomIn());
    expect(current().scale).toBe(3);
  });

  it('원본 해상도를 모르면 확대·축소할 수 없다', () => {
    const { current, stage } = setup();
    expect(current().canZoomIn).toBe(false);
    act(() => current().zoomIn());
    wheel(stage, { deltaY: -100, clientX: 480, clientY: 270 });
    expect(current().scale).toBe('fit');
  });

  it('휠을 올리면 확대, 내리면 축소된다', () => {
    const { current, stage, setSource } = setup(960, 540);
    setSource(1920, 1080);
    wheel(stage, { deltaY: -100, clientX: 480, clientY: 270 });
    const zoomed = current().zoom;
    expect(zoomed).toBeGreaterThan(1);
    wheel(stage, { deltaY: 100, clientX: 480, clientY: 270 });
    expect(current().zoom).toBeLessThan(zoomed);
  });

  it('휠 확대는 커서 아래 지점을 고정한다 — 오른쪽에서 확대하면 화면이 왼쪽으로 밀린다', () => {
    const { current, stage, setSource } = setup(960, 540);
    setSource(1920, 1080);
    wheel(stage, { deltaY: -100, clientX: 900, clientY: 270 });
    expect(current().panX).toBeLessThan(0);
    expect(current().panY).toBe(0);
  });

  it('트랙패드 핀치(ctrl+휠)가 페이지 전체를 확대하지 않게 막는다', () => {
    const { stage, setSource } = setup(960, 540);
    setSource(1920, 1080);
    const e = wheel(stage, { deltaY: -10, ctrlKey: true, clientX: 480, clientY: 270 });
    expect(e.defaultPrevented).toBe(true);
  });
});

describe('useScreenViewerViewModel - 드래그 이동', () => {
  it('맞춤 크기에서는 드래그해도 움직이지 않는다', () => {
    const { current, pointer } = setup();
    act(() => current().onPointerDown(pointer(1, 400, 200)));
    act(() => current().onPointerMove(pointer(1, 500, 300)));
    expect(current().canPan).toBe(false);
    expect(current().panX).toBe(0);
    expect(current().isPanning).toBe(false);
  });

  it('확대 후 드래그한 만큼 이동하고, 손을 떼면 멈춘다', () => {
    const { current, setSource, pointer } = setup(960, 540);
    setSource(1920, 1080);
    act(() => current().setScale(1));
    expect(current().canPan).toBe(true);
    act(() => current().onPointerDown(pointer(1, 400, 200)));
    expect(current().isPanning).toBe(true);
    act(() => current().onPointerMove(pointer(1, 430, 210)));
    expect(current().panX).toBe(30);
    expect(current().panY).toBe(10);
    act(() => current().onPointerUp(pointer(1, 430, 210)));
    expect(current().isPanning).toBe(false);
    act(() => current().onPointerMove(pointer(1, 500, 300)));
    expect(current().panX).toBe(30);
  });

  it('원본 화면 가장자리를 넘어 이동하지 않는다', () => {
    const { current, setSource, pointer } = setup(960, 540);
    setSource(1920, 1080);
    act(() => current().setScale(1)); // 1920x1080 → 가로 ±480, 세로 ±270
    act(() => current().onPointerDown(pointer(1, 0, 0)));
    act(() => current().onPointerMove(pointer(1, 5000, -5000)));
    expect(current().panX).toBe(480);
    expect(current().panY).toBe(-270);
  });

  it('다른 포인터의 이동은 무시한다', () => {
    const { current, setSource, pointer } = setup(960, 540);
    setSource(1920, 1080);
    act(() => current().setScale(1));
    act(() => current().onPointerDown(pointer(1, 400, 200)));
    act(() => current().onPointerMove(pointer(2, 500, 300)));
    expect(current().panX).toBe(0);
  });
});

describe('useScreenViewerViewModel - 전체화면', () => {
  it('요소 전체화면을 지원하지 않으면 canFullscreen이 false다', () => {
    setFullscreenSupport(false);
    const { current } = setup();
    expect(current().canFullscreen).toBe(false);
  });

  it('toggleFullscreen은 stage를 전체화면으로 올리고, 다시 누르면 빠져나온다', () => {
    setFullscreenSupport(true);
    const { current, stage } = setup();
    expect(current().canFullscreen).toBe(true);

    const request = vi.fn(async () => setFullscreenElement(stage));
    stage.requestFullscreen = request;
    act(() => current().toggleFullscreen());
    expect(request).toHaveBeenCalled();
    expect(current().isFullscreen).toBe(true);

    const exit = vi.fn(async () => setFullscreenElement(null));
    Object.defineProperty(document, 'exitFullscreen', { value: exit, configurable: true });
    act(() => current().toggleFullscreen());
    expect(exit).toHaveBeenCalled();
    expect(current().isFullscreen).toBe(false);
  });

  it('Esc 등 브라우저가 전체화면을 끝내도 상태가 따라온다', () => {
    setFullscreenSupport(true);
    const { current, stage } = setup();
    act(() => setFullscreenElement(stage));
    expect(current().isFullscreen).toBe(true);
    act(() => setFullscreenElement(null));
    expect(current().isFullscreen).toBe(false);
  });

  it('다른 요소가 전체화면이면 이 stage는 전체화면이 아니다', () => {
    setFullscreenSupport(true);
    const { current } = setup();
    act(() => setFullscreenElement(document.body));
    expect(current().isFullscreen).toBe(false);
  });
});
