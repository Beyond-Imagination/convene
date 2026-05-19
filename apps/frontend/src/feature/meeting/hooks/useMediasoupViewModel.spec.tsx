import { act, renderHook, waitFor } from '@testing-library/react';

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

    // 호출된 RPC 이름 순서 검증(앞 3개 — ready 도달 후 LIST_PRODUCERS 등 후속 RPC 는 무시)
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

  it('PRODUCER_CLOSED 수신 시 해당 producerId 항목이 remoteMedia 에서 제거된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const onNewProducer = captureSocketListener(
      socket,
      MEDIASOUP_WS_EVENTS.NEW_PRODUCER,
    );
    onNewProducer({
      peerSocketId: 's2',
      producerId: 'p-remote-audio',
      kind: 'audio',
      source: 'audio',
    });
    await waitFor(() => expect(result.current.remoteMedia).toHaveLength(1));

    const onProducerClosed = captureSocketListener(
      socket,
      MEDIASOUP_WS_EVENTS.PRODUCER_CLOSED,
    );
    onProducerClosed({ producerId: 'p-remote-audio' });
    await waitFor(() => expect(result.current.remoteMedia).toHaveLength(0));
  });

  it('CONSUMER_CLOSED 수신 시 해당 consumerId 항목이 remoteMedia 에서 제거된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const onNewProducer = captureSocketListener(
      socket,
      MEDIASOUP_WS_EVENTS.NEW_PRODUCER,
    );
    onNewProducer({
      peerSocketId: 's2',
      producerId: 'p-remote-audio',
      kind: 'audio',
      source: 'audio',
    });
    await waitFor(() => expect(result.current.remoteMedia).toHaveLength(1));

    const onConsumerClosed = captureSocketListener(
      socket,
      MEDIASOUP_WS_EVENTS.CONSUMER_CLOSED,
    );
    onConsumerClosed({ consumerId: 'c-p-remote-audio' });
    await waitFor(() => expect(result.current.remoteMedia).toHaveLength(0));
  });

  it('unmount 시 PRODUCER_CLOSED / CONSUMER_CLOSED 핸들러도 socket.off 로 해제된다', async () => {
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

  it('socket 두 번째 connect 시 기존 transport 가 close 되고 새 transport 가 생성된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const sendOld = fakeDevice.createSendTransport.mock.results[0]
      .value as FakeTransport;
    const recvOld = fakeDevice.createRecvTransport.mock.results[0]
      .value as FakeTransport;

    const onConnect = captureSocketListener(socket, 'connect');
    await act(async () => {
      onConnect(); // 첫 connect 등록(count=1, reconnect 아님)
      onConnect(); // 두 번째 connect = 재연결
    });

    await waitFor(() =>
      expect(fakeDevice.createSendTransport).toHaveBeenCalledTimes(2),
    );
    expect(sendOld.close).toHaveBeenCalled();
    expect(recvOld.close).toHaveBeenCalled();
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('재연결 시 remoteMedia 가 초기화되어 stale 항목이 제거된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const onNewProducer = captureSocketListener(
      socket,
      MEDIASOUP_WS_EVENTS.NEW_PRODUCER,
    );
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
      // getDisplayMedia 는 video 만 반환하는 케이스가 일반적이라 audio track 은 제거.
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

  it('초기 상태에서 isSharingScreen 은 false 이고 screenStream 은 null 이다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.isSharingScreen).toBe(false);
    expect(result.current.screenStream).toBeNull();
  });

  it('startScreenShare() 호출 시 getDisplayMedia 가 호출되고 sendTransport.produce({source:screen}) 으로 produce 된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const send = fakeDevice.createSendTransport.mock.results[0]
      .value as FakeTransport;
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

  it('startScreenShare 의 produce 이벤트는 PRODUCE RPC 의 source=screen 으로 위임된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const send = fakeDevice.createSendTransport.mock.results[0]
      .value as FakeTransport;
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
    expect(produceCall?.[1]).toEqual(
      expect.objectContaining({ source: 'screen', kind: 'video' }),
    );
  });

  it('stopScreenShare() 호출 시 screenStream track 이 stop 되고 상태가 초기화된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await result.current.startScreenShare();
    });
    const stream = result.current.screenStream as unknown as FakeMediaStream;
    expect(stream).not.toBeNull();

    await act(async () => {
      result.current.stopScreenShare();
    });

    expect(result.current.isSharingScreen).toBe(false);
    expect(result.current.screenStream).toBeNull();
    for (const t of stream.getTracks()) expect(t.stop).toHaveBeenCalled();
  });

  it('이미 공유 중이면 startScreenShare 는 getDisplayMedia 를 두 번 호출하지 않는다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
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

  it('ready 도달 후 LIST_PRODUCERS RPC 가 한 번 호출된다', async () => {
    const socket = new FakeSocket();
    setupSocketAcks(socket);
    const { result } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await waitFor(() =>
      expect(
        socket.emitWithAck.mock.calls.some(
          (c) => c[0] === MEDIASOUP_WS_EVENTS.LIST_PRODUCERS,
        ),
      ).toBe(true),
    );
    const listCalls = socket.emitWithAck.mock.calls.filter(
      (c) => c[0] === MEDIASOUP_WS_EVENTS.LIST_PRODUCERS,
    );
    expect(listCalls).toHaveLength(1);
    expect(listCalls[0][1]).toEqual({ code });
  });

  it('LIST_PRODUCERS 응답의 각 producer 는 NEW_PRODUCER 와 동일 흐름으로 consume 된다', async () => {
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
    const { result } = renderHook(() =>
      useMediasoupViewModel(socket as unknown as never, code),
    );
    await waitFor(() => expect(result.current.remoteMedia).toHaveLength(2));
    const producerIds = result.current.remoteMedia.map((m) => m.producerId).sort();
    expect(producerIds).toEqual(['p-existing-aud', 'p-existing-vid']);
  });
});
