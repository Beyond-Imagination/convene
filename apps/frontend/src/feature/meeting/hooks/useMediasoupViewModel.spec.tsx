import { renderHook, waitFor } from '@testing-library/react';

import { MEDIASOUP_WS_EVENTS } from '@migration/shared-interfaces';

import { useMediasoupViewModel } from './useMediasoupViewModel';

/**
 * mediasoup-client `Device` 와 그 `Transport` 의 최소 fake.
 *
 * 실제 RTC peer connection 동작은 검증하지 않고, ViewModel 이 RPC 와 device 호출
 * 순서를 올바르게 수행하는지에 집중한다.
 */
class FakeTransport {
  readonly id: string;
  readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  readonly close = vi.fn();

  constructor(id: string) {
    this.id = id;
  }

  on(event: string, fn: (...args: unknown[]) => void): this {
    const list = this.listeners.get(event) ?? [];
    list.push(fn);
    this.listeners.set(event, list);
    return this;
  }
}

class FakeDevice {
  readonly load = vi.fn(async () => {});
  readonly createSendTransport = vi.fn(
    (opts: { id: string }) => new FakeTransport(opts.id),
  );
  readonly createRecvTransport = vi.fn(
    (opts: { id: string }) => new FakeTransport(opts.id),
  );
}

let fakeDevice: FakeDevice;

vi.mock('@/shared/socket/mediasoup-device.factory', () => ({
  createMediasoupDevice: async () => fakeDevice,
}));

class FakeSocket {
  readonly emitWithAck = vi.fn();
  readonly on = vi.fn();
  readonly off = vi.fn();
  readonly emit = vi.fn();
  readonly disconnect = vi.fn();
}

const code = 'abc12xyz';

const setupSocketAcks = (socket: FakeSocket) => {
  socket.emitWithAck.mockImplementation(async (event: string, _payload: unknown) => {
    if (event === MEDIASOUP_WS_EVENTS.GET_RTP_CAPABILITIES) {
      return { rtpCapabilities: { codecs: [] } };
    }
    if (event === MEDIASOUP_WS_EVENTS.CREATE_TRANSPORT) {
      const direction = (_payload as { direction: 'send' | 'recv' }).direction;
      return {
        id: `t-${direction}`,
        iceParameters: {},
        iceCandidates: [],
        dtlsParameters: {},
      };
    }
    if (event === MEDIASOUP_WS_EVENTS.CONNECT_TRANSPORT) {
      return undefined;
    }
    throw new Error(`unexpected RPC ${event}`);
  });
};

describe('useMediasoupViewModel.mount', () => {
  beforeEach(() => {
    fakeDevice = new FakeDevice();
  });

  it('socket 이 null 이면 status 는 idle 로 유지된다', () => {
    const { result } = renderHook(() => useMediasoupViewModel(null, code));
    expect(result.current.status).toBe('idle');
  });

  it('socket 이 주어지면 getRtpCapabilities → device.load → createTransport(send/recv) 순으로 호출한다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // 호출된 RPC 이름 순서 검증
    const calls = socket.emitWithAck.mock.calls.map((c) => c[0]);
    expect(calls).toEqual([
      MEDIASOUP_WS_EVENTS.GET_RTP_CAPABILITIES,
      MEDIASOUP_WS_EVENTS.CREATE_TRANSPORT,
      MEDIASOUP_WS_EVENTS.CREATE_TRANSPORT,
    ]);
    expect(fakeDevice.load).toHaveBeenCalledTimes(1);
    expect(fakeDevice.createSendTransport).toHaveBeenCalledTimes(1);
    expect(fakeDevice.createRecvTransport).toHaveBeenCalledTimes(1);
  });

  it('createTransport direction payload 가 각각 send/recv 로 호출된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const transportCalls = socket.emitWithAck.mock.calls.filter(
      (c) => c[0] === MEDIASOUP_WS_EVENTS.CREATE_TRANSPORT,
    );
    expect(transportCalls[0][1]).toEqual({ code, direction: 'send' });
    expect(transportCalls[1][1]).toEqual({ code, direction: 'recv' });
  });

  it('sendTransport "connect" 이벤트는 connectTransport RPC 로 위임된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const sendTransport = fakeDevice.createSendTransport.mock.results[0]
      .value as FakeTransport;
    const callback = vi.fn();
    const errback = vi.fn();
    socket.emitWithAck.mockClear();
    sendTransport.listeners.get('connect')?.[0](
      { dtlsParameters: { fingerprints: [] } },
      callback,
      errback,
    );
    await waitFor(() => expect(callback).toHaveBeenCalled());
    expect(socket.emitWithAck).toHaveBeenCalledWith(
      MEDIASOUP_WS_EVENTS.CONNECT_TRANSPORT,
      { code, transportId: 't-send', dtlsParameters: { fingerprints: [] } },
    );
  });

  it('RPC 가 throw 하면 status="error" + 메시지', async () => {
    const socket = new FakeSocket();
    socket.emitWithAck.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorMessage).toBe('boom');
  });

  it('unmount 시 양쪽 transport.close 호출', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result, unmount } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const send = fakeDevice.createSendTransport.mock.results[0].value as FakeTransport;
    const recv = fakeDevice.createRecvTransport.mock.results[0].value as FakeTransport;
    unmount();
    expect(send.close).toHaveBeenCalled();
    expect(recv.close).toHaveBeenCalled();
  });
});
