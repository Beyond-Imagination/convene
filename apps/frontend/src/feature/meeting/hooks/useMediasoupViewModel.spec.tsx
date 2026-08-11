import { MEDIASOUP_WS_EVENTS, MEETING_WS_EVENTS } from '@convene/shared-interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useMediasoupViewModel } from './useMediasoupViewModel';

/**
 * mediasoup-client `Device`와 그 `Transport`의 최소 fake.
 *
 * 실제 RTC peer connection 동작은 검증하지 않고, ViewModel이 RPC와 device 호출
 * 순서를 올바르게 수행하는지에 집중한다.
 */
class FakeTrack {
  readonly kind: 'audio' | 'video';
  readonly stop = vi.fn();
  enabled = true;
  private readonly handlers = new Map<string, Array<() => void>>();
  readonly addEventListener = vi.fn((event: string, cb: () => void) => {
    const arr = this.handlers.get(event) ?? [];
    arr.push(cb);
    this.handlers.set(event, arr);
  });

  constructor(kind: 'audio' | 'video') {
    this.kind = kind;
  }

  /** 브라우저가 발화하는 이벤트(예: 화면 공유 native '공유 중지' 의 'ended')를 흉내낸다. */
  emit(event: string): void {
    for (const cb of this.handlers.get(event) ?? []) cb();
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

/**
 * mediasoup-client `Producer`의 최소 fake. mute toggle이 pause/resume을 호출하고
 * paused getter를 읽는지 검증하기 위해 상태를 들고 있는다.
 */
class FakeProducer {
  paused = false;
  readonly pause = vi.fn(() => {
    this.paused = true;
  });
  readonly resume = vi.fn(() => {
    this.paused = false;
  });
  readonly close = vi.fn();
  constructor(
    readonly id: string,
    readonly track: FakeTrack,
  ) {}
}

class FakeTransport {
  readonly id: string;
  readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  readonly close = vi.fn();
  readonly produce = vi.fn(
    async (opts: { track: FakeTrack }): Promise<FakeProducer> =>
      new FakeProducer(`producer-${opts.track.kind}`, opts.track),
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
  readonly createSendTransport = vi.fn((opts: { id: string }) => new FakeTransport(opts.id));
  readonly createRecvTransport = vi.fn((opts: { id: string }) => new FakeTransport(opts.id));
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
    if (event === MEDIASOUP_WS_EVENTS.LIST_PRODUCERS) {
      return { producers: [] };
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

  it('socket이 null 이면 status는 idle로 유지된다', () => {
    const { result } = renderHook(() => useMediasoupViewModel(null, code));
    expect(result.current.status).toBe('idle');
  });

  it('socket이 주어지면 getRtpCapabilities → device.load → createTransport(send/recv) 순으로 호출한다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // 호출된 RPC 이름 순서 검증(앞 3개 — ready 도달 후 LIST_PRODUCERS 등 후속 RPC는 무시)
    const calls = socket.emitWithAck.mock.calls.map((c) => c[0]);
    expect(calls.slice(0, 3)).toEqual([
      MEDIASOUP_WS_EVENTS.GET_RTP_CAPABILITIES,
      MEDIASOUP_WS_EVENTS.CREATE_TRANSPORT,
      MEDIASOUP_WS_EVENTS.CREATE_TRANSPORT,
    ]);
    expect(fakeDevice.load).toHaveBeenCalledTimes(1);
    expect(fakeDevice.createSendTransport).toHaveBeenCalledTimes(1);
    expect(fakeDevice.createRecvTransport).toHaveBeenCalledTimes(1);
  });

  it('createTransport direction payload가 각각 send/recv로 호출된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const transportCalls = socket.emitWithAck.mock.calls.filter(
      (c) => c[0] === MEDIASOUP_WS_EVENTS.CREATE_TRANSPORT,
    );
    expect(transportCalls[0][1]).toEqual({ code, direction: 'send' });
    expect(transportCalls[1][1]).toEqual({ code, direction: 'recv' });
  });

  it('sendTransport "connect" 이벤트는 connectTransport RPC로 위임된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const sendTransport = fakeDevice.createSendTransport.mock.results[0].value as FakeTransport;
    const callback = vi.fn();
    const errback = vi.fn();
    socket.emitWithAck.mockClear();
    sendTransport.listeners.get('connect')?.[0](
      { dtlsParameters: { fingerprints: [] } },
      callback,
      errback,
    );
    await waitFor(() => expect(callback).toHaveBeenCalled());
    expect(socket.emitWithAck).toHaveBeenCalledWith(MEDIASOUP_WS_EVENTS.CONNECT_TRANSPORT, {
      code,
      transportId: 't-send',
      dtlsParameters: { fingerprints: [] },
    });
  });

  it('RPC가 throw 하면 status="error" + 메시지', async () => {
    const socket = new FakeSocket();
    socket.emitWithAck.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
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

  it('ready 진입 후에도 getUserMedia/produce를 호출하지 않는다 (미디어 lazy — 사용자가 켤 때 취득)', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const send = fakeDevice.createSendTransport.mock.results[0].value as FakeTransport;
    // 입장 시점엔 카메라/마이크를 잡지 않는다(LED 깜박임 방지).
    expect(getUserMediaMock).not.toHaveBeenCalled();
    expect(send.produce).not.toHaveBeenCalled();
    expect(result.current.localStream).toBeNull();
    expect(result.current.isAudioMuted).toBe(true);
    expect(result.current.isVideoMuted).toBe(true);
  });

  it('sendTransport "produce" 이벤트는 PRODUCE RPC로 위임되고 callback에 producerId를 넘긴다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const send = fakeDevice.createSendTransport.mock.results[0].value as FakeTransport;
    const callback = vi.fn();
    const errback = vi.fn();
    socket.emitWithAck.mockClear();
    send.listeners.get('produce')?.[0](
      {
        kind: 'audio',
        rtpParameters: { codecs: [] },
        appData: { source: 'audio', paused: true },
      },
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
        // appData.paused가 PRODUCE RPC의 paused로 위임된다(기본 OFF 입장).
        paused: true,
      }),
    );
  });

  it('toggle로 켜 둔 미디어는 unmount 시 track이 stop 된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result, unmount } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    // 사용자가 카메라를 켜야 비로소 getUserMedia로 디바이스를 잡는다.
    await act(async () => {
      await result.current.toggleVideo();
    });
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

  it('NEW_PRODUCER 수신 시 CONSUME RPC + recvTransport.consume + RESUME_CONSUMER가 차례로 호출된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
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

  it('NEW_PRODUCER 수신 후 result.remoteMedia에 항목이 추가된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
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

  it('unmount 시 NEW_PRODUCER 핸들러가 socket.off로 해제된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result, unmount } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    unmount();
    expect(socket.off).toHaveBeenCalledWith(MEDIASOUP_WS_EVENTS.NEW_PRODUCER, expect.any(Function));
  });

  it('PRODUCER_CLOSED 수신 시 해당 producerId 항목이 remoteMedia에서 제거된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const onNewProducer = captureSocketListener(socket, MEDIASOUP_WS_EVENTS.NEW_PRODUCER);
    onNewProducer({
      peerSocketId: 's2',
      producerId: 'p-remote-audio',
      kind: 'audio',
      source: 'audio',
    });
    await waitFor(() => expect(result.current.remoteMedia).toHaveLength(1));

    const onProducerClosed = captureSocketListener(socket, MEDIASOUP_WS_EVENTS.PRODUCER_CLOSED);
    onProducerClosed({ producerId: 'p-remote-audio' });
    await waitFor(() => expect(result.current.remoteMedia).toHaveLength(0));
  });

  it('CONSUMER_CLOSED 수신 시 해당 consumerId 항목이 remoteMedia에서 제거된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const onNewProducer = captureSocketListener(socket, MEDIASOUP_WS_EVENTS.NEW_PRODUCER);
    onNewProducer({
      peerSocketId: 's2',
      producerId: 'p-remote-audio',
      kind: 'audio',
      source: 'audio',
    });
    await waitFor(() => expect(result.current.remoteMedia).toHaveLength(1));

    const onConsumerClosed = captureSocketListener(socket, MEDIASOUP_WS_EVENTS.CONSUMER_CLOSED);
    onConsumerClosed({ consumerId: 'c-p-remote-audio' });
    await waitFor(() => expect(result.current.remoteMedia).toHaveLength(0));
  });

  it('PARTICIPANT_LEFT 수신 시 그 참가자의 remoteMedia가 모두 제거된다(비정상 종료 포함)', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const onNewProducer = captureSocketListener(socket, MEDIASOUP_WS_EVENTS.NEW_PRODUCER);
    // s2가 화면 공유 중인 상태.
    onNewProducer({
      peerSocketId: 's2',
      producerId: 'p-remote-screen',
      kind: 'video',
      source: 'screen',
    });
    await waitFor(() => expect(result.current.remoteMedia).toHaveLength(1));
    expect(result.current.isRemoteSharingScreen).toBe(true);

    // s2가 비정상 종료(탭 닫기 등) → 서버가 PARTICIPANT_LEFT broadcast.
    const onLeft = captureSocketListener(socket, MEETING_WS_EVENTS.PARTICIPANT_LEFT);
    act(() => onLeft({ socketId: 's2', leftAt: '2026-01-01T00:05:00.000Z' }));

    await waitFor(() => expect(result.current.remoteMedia).toHaveLength(0));
    // 떠난 사람의 screen이 사라졌으니 제약이 풀린다.
    expect(result.current.isRemoteSharingScreen).toBe(false);
  });

  it('unmount 시 PARTICIPANT_LEFT 핸들러도 socket.off로 해제된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result, unmount } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    unmount();
    expect(socket.off).toHaveBeenCalledWith(
      MEETING_WS_EVENTS.PARTICIPANT_LEFT,
      expect.any(Function),
    );
  });

  it('unmount 시 PRODUCER_CLOSED / CONSUMER_CLOSED 핸들러도 socket.off로 해제된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result, unmount } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    unmount();
    expect(socket.off).toHaveBeenCalledWith(
      MEDIASOUP_WS_EVENTS.PRODUCER_CLOSED,
      expect.any(Function),
    );
    expect(socket.off).toHaveBeenCalledWith(
      MEDIASOUP_WS_EVENTS.CONSUMER_CLOSED,
      expect.any(Function),
    );
  });
});

describe('useMediasoupViewModel.reconnect', () => {
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

  it('socket 두 번째 connect 시 기존 transport가 close 되고 새 transport가 생성된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const sendOld = fakeDevice.createSendTransport.mock.results[0].value as FakeTransport;
    const recvOld = fakeDevice.createRecvTransport.mock.results[0].value as FakeTransport;

    const onConnect = captureSocketListener(socket, 'connect');
    await act(async () => {
      onConnect(); // 첫 connect 등록(count=1, reconnect 아님)
      onConnect(); // 두 번째 connect = 재연결
    });

    await waitFor(() => expect(fakeDevice.createSendTransport).toHaveBeenCalledTimes(2));
    expect(sendOld.close).toHaveBeenCalled();
    expect(recvOld.close).toHaveBeenCalled();
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('재연결 시 remoteMedia가 초기화되어 stale 항목이 제거된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const onNewProducer = captureSocketListener(socket, MEDIASOUP_WS_EVENTS.NEW_PRODUCER);
    onNewProducer({
      peerSocketId: 's2',
      producerId: 'p-stale',
      kind: 'audio',
      source: 'audio',
    });
    await waitFor(() => expect(result.current.remoteMedia).toHaveLength(1));

    const onConnect = captureSocketListener(socket, 'connect');
    await act(async () => {
      onConnect();
      onConnect();
    });
    await waitFor(() => expect(result.current.remoteMedia).toEqual([]));
  });
});

describe('useMediasoupViewModel.screenShare', () => {
  let getDisplayMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fakeDevice = new FakeDevice();
    getUserMediaMock = vi.fn(async () => new FakeMediaStream());
    getDisplayMediaMock = vi.fn(async () => {
      const stream = new FakeMediaStream();
      // getDisplayMedia는 video만 반환하는 케이스가 일반적이라 audio track은 제거.
      stream.tracks.splice(0, 1);
      return stream;
    });
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: getUserMediaMock,
        getDisplayMedia: getDisplayMediaMock,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('초기 상태에서 isSharingScreen은 false이고 screenStream은 null 이다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.isSharingScreen).toBe(false);
    expect(result.current.screenStream).toBeNull();
    expect(result.current.isRemoteSharingScreen).toBe(false);
  });

  it('원격 참가자가 screen source producer를 만들면 isRemoteSharingScreen=true', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const onNewProducer = captureSocketListener(socket, MEDIASOUP_WS_EVENTS.NEW_PRODUCER);
    onNewProducer({
      peerSocketId: 's2',
      producerId: 'p-remote-screen',
      kind: 'video',
      source: 'screen',
    });
    await waitFor(() => expect(result.current.isRemoteSharingScreen).toBe(true));
  });

  it('startScreenShare() 호출 시 getDisplayMedia가 호출되고 sendTransport.produce({source:screen})으로 produce 된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const send = fakeDevice.createSendTransport.mock.results[0].value as FakeTransport;
    const initialProduceCount = send.produce.mock.calls.length;

    await act(async () => {
      await result.current.startScreenShare();
    });

    expect(getDisplayMediaMock).toHaveBeenCalledTimes(1);
    expect(send.produce.mock.calls.length).toBe(initialProduceCount + 1);
    const lastCall = send.produce.mock.calls[send.produce.mock.calls.length - 1];
    expect(lastCall[0].appData).toEqual({ source: 'screen' });
    expect(result.current.isSharingScreen).toBe(true);
    expect(result.current.screenStream).not.toBeNull();
  });

  it('startScreenShare의 produce 이벤트는 PRODUCE RPC의 source=screen으로 위임된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const send = fakeDevice.createSendTransport.mock.results[0].value as FakeTransport;
    await act(async () => {
      await result.current.startScreenShare();
    });

    const callback = vi.fn();
    const errback = vi.fn();
    socket.emitWithAck.mockClear();
    send.listeners.get('produce')?.[0](
      { kind: 'video', rtpParameters: { codecs: [] }, appData: { source: 'screen' } },
      callback,
      errback,
    );
    await waitFor(() => expect(callback).toHaveBeenCalled());
    const produceCall = socket.emitWithAck.mock.calls.find(
      (c) => c[0] === MEDIASOUP_WS_EVENTS.PRODUCE,
    );
    expect(produceCall?.[1]).toEqual(expect.objectContaining({ source: 'screen', kind: 'video' }));
  });

  it('stopScreenShare() 호출 시 screenStream track이 stop 되고 상태가 초기화된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await result.current.startScreenShare();
    });
    const stream = result.current.screenStream as unknown as FakeMediaStream;
    expect(stream).not.toBeNull();

    socket.emit.mockClear();
    await act(async () => {
      result.current.stopScreenShare();
    });

    expect(result.current.isSharingScreen).toBe(false);
    expect(result.current.screenStream).toBeNull();
    for (const t of stream.getTracks()) expect(t.stop).toHaveBeenCalled();
    // 서버에도 종료를 알려야 동시 1인 제약이 풀린다.
    expect(socket.emit).toHaveBeenCalledWith(MEDIASOUP_WS_EVENTS.CLOSE_PRODUCER, {
      code,
      producerId: 'producer-video',
    });
  });

  it('브라우저 native "공유 중지"(track ended)에도 closeProducer가 서버에 전달되고 상태가 초기화된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await result.current.startScreenShare();
    });
    const stream = result.current.screenStream as unknown as FakeMediaStream;
    const videoTrack = stream.getVideoTracks()[0];

    socket.emit.mockClear();
    await act(async () => {
      videoTrack.emit('ended');
    });

    expect(result.current.isSharingScreen).toBe(false);
    expect(result.current.screenStream).toBeNull();
    expect(socket.emit).toHaveBeenCalledWith(MEDIASOUP_WS_EVENTS.CLOSE_PRODUCER, {
      code,
      producerId: 'producer-video',
    });
  });

  it('socket이 null→연결로 늦게 바뀐 뒤 native stop에도 최신 socket으로 closeProducer가 전달된다', async () => {
    // 실제 앱에서 socket은 처음 null 이었다가 연결되므로, 'ended' 핸들러가 옛
    // (socket=null) 클로저를 잡으면 closeProducer emit이 누락된다(stale closure).
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result, rerender } = renderHook(
      ({ s }: { s: FakeSocket | null }) => useMediasoupViewModel(s as unknown as never, code),
      { initialProps: { s: null as FakeSocket | null } },
    );
    await act(async () => {
      rerender({ s: socket });
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await result.current.startScreenShare();
    });
    const stream = result.current.screenStream as unknown as FakeMediaStream;
    const videoTrack = stream.getVideoTracks()[0];

    socket.emit.mockClear();
    await act(async () => {
      videoTrack.emit('ended');
    });

    expect(socket.emit).toHaveBeenCalledWith(MEDIASOUP_WS_EVENTS.CLOSE_PRODUCER, {
      code,
      producerId: 'producer-video',
    });
  });

  it('이미 공유 중이면 startScreenShare는 getDisplayMedia를 두 번 호출하지 않는다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await result.current.startScreenShare();
    });
    expect(getDisplayMediaMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.startScreenShare();
    });
    expect(getDisplayMediaMock).toHaveBeenCalledTimes(1);
  });

  it('재연결 시 화면 공유 상태가 초기화되고 stale producer를 서버에 알리지 않는다', async () => {
    // 재연결하면 participantId(socket.id)가 새로 발급된다. 재시작 전에 만든 producerId로
    // CLOSE_PRODUCER를 보내면 서버가 새 참가자 기준으로 소유권을 검사해 거부한다.
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await result.current.startScreenShare();
    });
    const stream = result.current.screenStream as unknown as FakeMediaStream;
    expect(result.current.isSharingScreen).toBe(true);

    socket.emit.mockClear();
    const onConnect = captureSocketListener(socket, 'connect');
    await act(async () => {
      onConnect();
      onConnect();
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.isSharingScreen).toBe(false);
    expect(result.current.screenStream).toBeNull();
    for (const t of stream.getTracks()) expect(t.stop).toHaveBeenCalled();
    expect(socket.emit).not.toHaveBeenCalledWith(
      MEDIASOUP_WS_EVENTS.CLOSE_PRODUCER,
      expect.anything(),
    );
  });

  it('재연결 후 화면 공유를 다시 시작할 수 있다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await result.current.startScreenShare();
    });

    const onConnect = captureSocketListener(socket, 'connect');
    await act(async () => {
      onConnect();
      onConnect();
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.startScreenShare();
    });

    expect(getDisplayMediaMock).toHaveBeenCalledTimes(2);
    expect(result.current.isSharingScreen).toBe(true);
  });
});

describe('useMediasoupViewModel.listProducers (기존 producer 합류)', () => {
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

  it('ready 도달 후 LIST_PRODUCERS RPC가 한 번 호출된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() =>
      expect(
        socket.emitWithAck.mock.calls.some((c) => c[0] === MEDIASOUP_WS_EVENTS.LIST_PRODUCERS),
      ).toBe(true),
    );
    const listCalls = socket.emitWithAck.mock.calls.filter(
      (c) => c[0] === MEDIASOUP_WS_EVENTS.LIST_PRODUCERS,
    );
    expect(listCalls).toHaveLength(1);
    expect(listCalls[0][1]).toEqual({ code });
  });

  it('LIST_PRODUCERS 응답의 각 producer는 NEW_PRODUCER와 동일 흐름으로 consume 된다', async () => {
    const socket = new FakeSocket();
    socket.emitWithAck.mockImplementation(async (event: string, payload: unknown) => {
      if (event === MEDIASOUP_WS_EVENTS.GET_RTP_CAPABILITIES) {
        return { rtpCapabilities: { codecs: [] } };
      }
      if (event === MEDIASOUP_WS_EVENTS.CREATE_TRANSPORT) {
        const dir = (payload as { direction: 'send' | 'recv' }).direction;
        return {
          id: `t-${dir}`,
          iceParameters: {},
          iceCandidates: [],
          dtlsParameters: {},
        };
      }
      if (event === MEDIASOUP_WS_EVENTS.CONNECT_TRANSPORT) return undefined;
      if (event === MEDIASOUP_WS_EVENTS.PRODUCE) {
        return { producerId: 'pr-x' };
      }
      if (event === MEDIASOUP_WS_EVENTS.CONSUME) {
        const p = payload as { producerId: string };
        return {
          id: `c-${p.producerId}`,
          producerId: p.producerId,
          kind: 'audio',
          rtpParameters: {},
        };
      }
      if (event === MEDIASOUP_WS_EVENTS.RESUME_CONSUMER) return undefined;
      if (event === MEDIASOUP_WS_EVENTS.LIST_PRODUCERS) {
        return {
          producers: [
            {
              peerSocketId: 's2',
              producerId: 'p-existing-aud',
              kind: 'audio',
              source: 'audio',
            },
            {
              peerSocketId: 's2',
              producerId: 'p-existing-vid',
              kind: 'video',
              source: 'video',
            },
          ],
        };
      }
      throw new Error(`unexpected RPC ${event}`);
    });
    const { result } = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(result.current.remoteMedia).toHaveLength(2));
    const producerIds = result.current.remoteMedia.map((m) => m.producerId).sort();
    expect(producerIds).toEqual(['p-existing-aud', 'p-existing-vid']);
  });
});

describe('useMediasoupViewModel.muteToggle', () => {
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

  const setupReady = async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const hook = renderHook(() => useMediasoupViewModel(socket as unknown as never, code));
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    const send = fakeDevice.createSendTransport.mock.results[0].value as FakeTransport;
    // 입장 시엔 미디어를 잡지 않는다(lazy) — produce 대기 없이 ready 도달만 기다린다.
    return { socket, send, ...hook };
  };

  it('입장 직후 isAudioMuted/isVideoMuted가 true이고 getUserMedia/produce를 호출하지 않는다 (기본 OFF, lazy)', async () => {
    const { result, send } = await setupReady();
    expect(result.current.isAudioMuted).toBe(true);
    expect(result.current.isVideoMuted).toBe(true);
    expect(getUserMediaMock).not.toHaveBeenCalled();
    expect(send.produce).not.toHaveBeenCalled();
    expect(result.current.localStream).toBeNull();
  });

  it('toggleAudio 최초 호출 시 getUserMedia(노이즈 억제 오디오 제약)로 취득해 produce(source=audio) 하고 isAudioMuted=false', async () => {
    const { result, send } = await setupReady();
    await act(async () => {
      await result.current.toggleAudio();
    });
    expect(getUserMediaMock).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        voiceIsolation: true,
      },
    });
    expect(send.produce).toHaveBeenCalledTimes(1);
    expect(send.produce.mock.calls[0][0].appData).toMatchObject({ source: 'audio' });
    expect(result.current.isAudioMuted).toBe(false);
  });

  it('연속 토글을 막는다 — 토글마다 캡처 배선이 새로 만들어지므로 쿨다운을 둔다', async () => {
    const { result, send } = await setupReady();
    await act(async () => {
      await result.current.toggleAudio();
    });
    expect(send.produce).toHaveBeenCalledTimes(1);
    expect(result.current.isAudioToggling).toBe(true);

    // 쿨다운 중 재클릭은 무시된다(끄기가 일어나지 않는다).
    await act(async () => {
      await result.current.toggleAudio();
    });
    expect(result.current.isAudioMuted).toBe(false);
  });

  it('오디오 produce는 opusDtx를 끈다 — DTX가 켜지면 무음 구간에 RTP가 끊겨 회의록 STT 캡처가 죽는다', async () => {
    const { result, send } = await setupReady();
    await act(async () => {
      await result.current.toggleAudio();
    });
    expect(send.produce.mock.calls[0][0].codecOptions).toMatchObject({
      opusDtx: false,
      opusFec: true,
    });
  });

  it('켜진 뒤 toggleAudio를 다시 호출하면 producer.close + track.stop + CLOSE_PRODUCER emit + isAudioMuted=true', async () => {
    const { result, send, socket } = await setupReady();
    await act(async () => {
      await result.current.toggleAudio();
    });
    const producer = (await send.produce.mock.results[0].value) as FakeProducer;
    const stream = (await getUserMediaMock.mock.results[0].value) as FakeMediaStream;
    socket.emit.mockClear();
    // 연타 방지 쿨다운이 풀린 뒤라야 끄기가 받아진다.
    await waitFor(() => expect(result.current.isAudioToggling).toBe(false), { timeout: 2000 });
    await act(async () => {
      await result.current.toggleAudio();
    });
    expect(producer.close).toHaveBeenCalledTimes(1);
    for (const t of stream.getAudioTracks()) expect(t.stop).toHaveBeenCalled();
    expect(result.current.isAudioMuted).toBe(true);
    expect(socket.emit).toHaveBeenCalledWith(MEDIASOUP_WS_EVENTS.CLOSE_PRODUCER, {
      code,
      producerId: 'producer-audio',
    });
  });

  it('toggleVideo 최초 호출 시 getUserMedia({video:true})로 취득해 produce(source=video) + localStream 설정 + isVideoMuted=false', async () => {
    const { result, send } = await setupReady();
    await act(async () => {
      await result.current.toggleVideo();
    });
    expect(getUserMediaMock).toHaveBeenCalledWith({ video: true });
    expect(send.produce.mock.calls[0][0].appData).toMatchObject({ source: 'video' });
    expect(result.current.isVideoMuted).toBe(false);
    expect(result.current.localStream).not.toBeNull();
  });

  it('켜진 뒤 toggleVideo를 다시 호출하면 producer.close + CLOSE_PRODUCER emit + localStream=null + isVideoMuted=true', async () => {
    const { result, send, socket } = await setupReady();
    await act(async () => {
      await result.current.toggleVideo();
    });
    const producer = (await send.produce.mock.results[0].value) as FakeProducer;
    socket.emit.mockClear();
    await act(async () => {
      await result.current.toggleVideo();
    });
    expect(producer.close).toHaveBeenCalledTimes(1);
    expect(result.current.localStream).toBeNull();
    expect(result.current.isVideoMuted).toBe(true);
    expect(socket.emit).toHaveBeenCalledWith(MEDIASOUP_WS_EVENTS.CLOSE_PRODUCER, {
      code,
      producerId: 'producer-video',
    });
  });

  it('원격 PRODUCER_TOGGLED 수신 시 remoteMedia의 해당 producer paused가 갱신된다', async () => {
    const { socket, result } = await setupReady();
    const onNewProducer = captureSocketListener(socket, MEDIASOUP_WS_EVENTS.NEW_PRODUCER);
    onNewProducer({
      peerSocketId: 's2',
      producerId: 'p-remote-audio',
      kind: 'audio',
      source: 'audio',
    });
    await waitFor(() => expect(result.current.remoteMedia).toHaveLength(1));
    expect(result.current.remoteMedia[0].paused).toBe(false);

    const onToggled = captureSocketListener(socket, MEDIASOUP_WS_EVENTS.PRODUCER_TOGGLED);
    act(() => onToggled({ producerId: 'p-remote-audio', paused: true }));
    await waitFor(() => expect(result.current.remoteMedia[0].paused).toBe(true));
  });

  it('unmount 시 PRODUCER_TOGGLED 핸들러가 socket.off로 해제된다', async () => {
    const { socket, unmount } = await setupReady();
    unmount();
    expect(socket.off).toHaveBeenCalledWith(
      MEDIASOUP_WS_EVENTS.PRODUCER_TOGGLED,
      expect.any(Function),
    );
  });
});
