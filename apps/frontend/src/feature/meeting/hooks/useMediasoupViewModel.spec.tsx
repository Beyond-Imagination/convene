import { renderHook, waitFor } from '@testing-library/react';

import { MEDIASOUP_WS_EVENTS } from '@migration/shared-interfaces';

import { useMediasoupViewModel } from './useMediasoupViewModel';

/**
 * mediasoup-client `Device` 와 그 `Transport` 의 최소 fake.
 *
 * 실제 RTC peer connection 동작은 검증하지 않고, ViewModel 이 RPC 와 device 호출
 * 순서를 올바르게 수행하는지에 집중한다.
 */
class FakeTrack {
  readonly kind: 'audio' | 'video';
  readonly stop = vi.fn();
  constructor(kind: 'audio' | 'video') {
    this.kind = kind;
  }
}

class FakeMediaStream {
  readonly tracks: FakeTrack[];
  constructor() {
    this.tracks = [new FakeTrack('audio'), new FakeTrack('video')];
  }
  getTracks(): FakeTrack[] {
    return this.tracks;
  }
  getAudioTracks(): FakeTrack[] {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
  getVideoTracks(): FakeTrack[] {
    return this.tracks.filter((t) => t.kind === 'video');
  }
}

let getUserMediaMock: ReturnType<typeof vi.fn>;

class FakeTransport {
  readonly id: string;
  readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  readonly close = vi.fn();
  readonly produce = vi.fn(
    async (opts: { track: FakeTrack }): Promise<{ id: string; track: FakeTrack }> => ({
      id: `producer-${opts.track.kind}`,
      track: opts.track,
    }),
  );
  readonly consume = vi.fn(
    async (opts: {
      id: string;
      producerId: string;
      kind: 'audio' | 'video';
    }): Promise<{ id: string; producerId: string; kind: string; track: FakeTrack }> => ({
      id: opts.id,
      producerId: opts.producerId,
      kind: opts.kind,
      track: new FakeTrack(opts.kind),
    }),
  );

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
    if (event === MEDIASOUP_WS_EVENTS.PRODUCE) {
      const kind = (_payload as { kind: 'audio' | 'video' }).kind;
      return { producerId: `pr-${kind}` };
    }
    if (event === MEDIASOUP_WS_EVENTS.CONSUME) {
      const payload = _payload as { producerId: string };
      return {
        id: `c-${payload.producerId}`,
        producerId: payload.producerId,
        kind: 'audio',
        rtpParameters: {},
      };
    }
    if (event === MEDIASOUP_WS_EVENTS.RESUME_CONSUMER) {
      return undefined;
    }
    throw new Error(`unexpected RPC ${event}`);
  });
};

const captureSocketListener = (socket: FakeSocket, event: string) => {
  const found = socket.on.mock.calls.find((c) => c[0] === event);
  if (!found) throw new Error(`socket.on('${event}') not registered`);
  return found[1] as (...args: unknown[]) => void;
};

describe('useMediasoupViewModel.mount', () => {
  beforeEach(() => {
    fakeDevice = new FakeDevice();
    getUserMediaMock = vi.fn(async () => new FakeMediaStream());
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: getUserMediaMock },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('ready 진입 후 getUserMedia 가 호출되고 audio/video track 으로 sendTransport.produce 가 두 번 호출된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() => expect(getUserMediaMock).toHaveBeenCalledTimes(1));
    expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true, video: true });

    const send = fakeDevice.createSendTransport.mock.results[0].value as FakeTransport;
    await waitFor(() => expect(send.produce).toHaveBeenCalledTimes(2));
    const producedKinds = send.produce.mock.calls.map((c) => c[0].track.kind).sort();
    expect(producedKinds).toEqual(['audio', 'video']);
    expect(result.current.localStream).not.toBeNull();
  });

  it('sendTransport "produce" 이벤트는 PRODUCE RPC 로 위임되고 callback 에 producerId 를 넘긴다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const send = fakeDevice.createSendTransport.mock.results[0].value as FakeTransport;
    const callback = vi.fn();
    const errback = vi.fn();
    socket.emitWithAck.mockClear();
    send.listeners.get('produce')?.[0](
      { kind: 'audio', rtpParameters: { codecs: [] }, appData: { source: 'audio' } },
      callback,
      errback,
    );
    await waitFor(() => expect(callback).toHaveBeenCalledWith({ id: 'pr-audio' }));
    expect(socket.emitWithAck).toHaveBeenCalledWith(
      MEDIASOUP_WS_EVENTS.PRODUCE,
      expect.objectContaining({
        code,
        transportId: 't-send',
        kind: 'audio',
        source: 'audio',
        rtpParameters: { codecs: [] },
      }),
    );
  });

  it('unmount 시 local stream tracks 가 stop 된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result, unmount } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() => expect(getUserMediaMock).toHaveBeenCalled());
    const stream = await getUserMediaMock.mock.results[0].value;
    unmount();
    const tracks = (stream as FakeMediaStream).getTracks();
    for (const t of tracks) expect(t.stop).toHaveBeenCalled();
  });
});

describe('useMediasoupViewModel.remoteConsume', () => {
  beforeEach(() => {
    fakeDevice = new FakeDevice();
    getUserMediaMock = vi.fn(async () => new FakeMediaStream());
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: getUserMediaMock },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('NEW_PRODUCER 수신 시 CONSUME RPC + recvTransport.consume + RESUME_CONSUMER 가 차례로 호출된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const recv = fakeDevice.createRecvTransport.mock.results[0].value as FakeTransport;
    const handler = captureSocketListener(socket, MEDIASOUP_WS_EVENTS.NEW_PRODUCER);
    socket.emitWithAck.mockClear();
    handler({
      peerSocketId: 's2',
      producerId: 'p-remote-audio',
      kind: 'audio',
      source: 'audio',
    });

    await waitFor(() => expect(recv.consume).toHaveBeenCalledTimes(1));
    const consumeRpc = socket.emitWithAck.mock.calls.find(
      (c) => c[0] === MEDIASOUP_WS_EVENTS.CONSUME,
    );
    expect(consumeRpc?.[1]).toEqual(
      expect.objectContaining({
        code,
        transportId: 't-recv',
        producerId: 'p-remote-audio',
      }),
    );
    const resumeRpc = socket.emitWithAck.mock.calls.find(
      (c) => c[0] === MEDIASOUP_WS_EVENTS.RESUME_CONSUMER,
    );
    expect(resumeRpc?.[1]).toEqual({ code, consumerId: 'c-p-remote-audio' });
  });

  it('NEW_PRODUCER 수신 후 result.remoteMedia 에 항목이 추가된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const handler = captureSocketListener(socket, MEDIASOUP_WS_EVENTS.NEW_PRODUCER);
    handler({
      peerSocketId: 's2',
      producerId: 'p-remote-audio',
      kind: 'audio',
      source: 'audio',
    });

    await waitFor(() => expect(result.current.remoteMedia).toHaveLength(1));
    expect(result.current.remoteMedia[0]).toEqual(
      expect.objectContaining({
        consumerId: 'c-p-remote-audio',
        peerSocketId: 's2',
        producerId: 'p-remote-audio',
        kind: 'audio',
        source: 'audio',
      }),
    );
    expect(result.current.remoteMedia[0].track).toBeDefined();
  });

  it('unmount 시 NEW_PRODUCER 핸들러가 socket.off 로 해제된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result, unmount } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    unmount();
    expect(socket.off).toHaveBeenCalledWith(
      MEDIASOUP_WS_EVENTS.NEW_PRODUCER,
      expect.any(Function),
    );
  });
});
