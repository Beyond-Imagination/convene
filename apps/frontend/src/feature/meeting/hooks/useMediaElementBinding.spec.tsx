import { act, render } from '@testing-library/react';
import { useRef } from 'react';

import { useMediaElementBinding } from './useMediaElementBinding';

/**
 * plum `useVideoElementBinding` 의 동작을 video/audio 공통으로 일반화한 hook.
 * View 가 MediaStream 을 받았을 때 srcObject 부착 + `loadeddata` 후 명시 play()
 * 까지 한 hook 에 캡슐화한다. spec 은 video element 로 검증하지만 audio 도 동일.
 */

interface ProbeProps {
  stream: MediaStream | null;
  enabled?: boolean;
  exposeRef?: (el: HTMLVideoElement | null) => void;
}

function VideoProbe({ stream, enabled, exposeRef }: ProbeProps) {
  const ref = useRef<HTMLVideoElement>(null);
  useMediaElementBinding({ ref, stream, enabled });
  return (
    <video
      ref={(el) => {
        ref.current = el;
        exposeRef?.(el);
      }}
      autoPlay
      muted
      playsInline
    />
  );
}

const fireLoadedData = (el: HTMLMediaElement) => {
  const event = new Event('loadeddata');
  el.dispatchEvent(event);
};

describe('useMediaElementBinding', () => {
  it('stream 이 주어지면 ref.current.srcObject 에 attach 된다', () => {
    const stream = new MediaStream();
    let captured: HTMLVideoElement | null = null;
    render(
      <VideoProbe stream={stream} exposeRef={(el) => (captured = el)} />,
    );
    expect(captured).not.toBeNull();
    expect(captured!.srcObject).toBe(stream);
  });

  it('stream 이 null 이면 srcObject 는 null 이고 pause 가 호출된다', () => {
    let captured: HTMLVideoElement | null = null;
    const { rerender } = render(
      <VideoProbe stream={new MediaStream()} exposeRef={(el) => (captured = el)} />,
    );
    const pauseSpy = vi.spyOn(captured!, 'pause');
    rerender(<VideoProbe stream={null} exposeRef={(el) => (captured = el)} />);
    expect(captured!.srcObject).toBeNull();
    expect(pauseSpy).toHaveBeenCalled();
  });

  it('enabled=false 면 srcObject 가 비어 있고 pause 가 호출된다', () => {
    let captured: HTMLVideoElement | null = null;
    const stream = new MediaStream();
    const { rerender } = render(
      <VideoProbe stream={stream} enabled exposeRef={(el) => (captured = el)} />,
    );
    expect(captured!.srcObject).toBe(stream);
    const pauseSpy = vi.spyOn(captured!, 'pause');
    rerender(
      <VideoProbe stream={stream} enabled={false} exposeRef={(el) => (captured = el)} />,
    );
    expect(captured!.srcObject).toBeNull();
    expect(pauseSpy).toHaveBeenCalled();
  });

  it('attach 후 loadeddata 이벤트 발화 시 play() 가 호출된다', () => {
    let captured: HTMLVideoElement | null = null;
    render(
      <VideoProbe stream={new MediaStream()} exposeRef={(el) => (captured = el)} />,
    );
    const playSpy = vi
      .spyOn(captured!, 'play')
      .mockResolvedValue(undefined);
    act(() => {
      fireLoadedData(captured!);
    });
    expect(playSpy).toHaveBeenCalled();
  });

  it('play() 가 reject 해도 throw 되지 않고 swallow 된다', async () => {
    let captured: HTMLVideoElement | null = null;
    render(
      <VideoProbe stream={new MediaStream()} exposeRef={(el) => (captured = el)} />,
    );
    const playSpy = vi
      .spyOn(captured!, 'play')
      .mockRejectedValue(new DOMException('NotAllowedError'));
    act(() => {
      fireLoadedData(captured!);
    });
    // microtask flush
    await Promise.resolve();
    expect(playSpy).toHaveBeenCalled();
    // 예외가 컴포넌트 밖으로 전파되지 않음(이 라인 도달 자체가 검증)
  });

  it('stream 이 바뀌면 새 stream 으로 srcObject 가 갱신된다', () => {
    let captured: HTMLVideoElement | null = null;
    const s1 = new MediaStream();
    const s2 = new MediaStream();
    const { rerender } = render(
      <VideoProbe stream={s1} exposeRef={(el) => (captured = el)} />,
    );
    expect(captured!.srcObject).toBe(s1);
    rerender(<VideoProbe stream={s2} exposeRef={(el) => (captured = el)} />);
    expect(captured!.srcObject).toBe(s2);
  });

  it('unmount 시 loadeddata 리스너가 더 이상 동작하지 않는다', () => {
    let captured: HTMLVideoElement | null = null;
    const { unmount } = render(
      <VideoProbe stream={new MediaStream()} exposeRef={(el) => (captured = el)} />,
    );
    const playSpy = vi
      .spyOn(captured!, 'play')
      .mockResolvedValue(undefined);
    playSpy.mockClear();
    unmount();
    act(() => {
      fireLoadedData(captured!);
    });
    expect(playSpy).not.toHaveBeenCalled();
  });
});
