import { describe, expect, it } from 'vitest';

import {
  type CloseProducerRequest,
  type ConnectTransportRequest,
  type ConsumerClosedBroadcast,
  type ConsumeRequest,
  type ConsumeResponse,
  type CreateTransportRequest,
  type CreateTransportResponse,
  type GetRtpCapabilitiesRequest,
  type GetRtpCapabilitiesResponse,
  type ListProducersRequest,
  type ListProducersResponse,
  MEDIA_TYPES,
  MEDIASOUP_WS_EVENTS,
  type MediasoupWsEventName,
  type MediaType,
  type NewProducerBroadcast,
  type ProducerClosedBroadcast,
  type ProduceRequest,
  type ProduceResponse,
  type ProducerToggledBroadcast,
  type ResumeConsumerRequest,
  type ToggleProducerRequest,
  type ToggleProducerResponse,
  TRANSPORT_DIRECTIONS,
  type TransportDirection,
} from './mediasoup.js';

describe('Mediasoup wire format', () => {
  it('모든 WS 이벤트는 mediasoup: prefix를 사용한다', () => {
    for (const name of Object.values(MEDIASOUP_WS_EVENTS)) {
      expect(name.startsWith('mediasoup:')).toBe(true);
    }
  });

  it('WS 이벤트 이름은 모두 서로 다르고 13개다 (RPC 9 + 브로드캐스트 4)', () => {
    const all = Object.values(MEDIASOUP_WS_EVENTS);
    expect(all).toHaveLength(13);
    expect(new Set(all).size).toBe(all.length);
  });

  it('MediasoupWsEventName union은 상수 값과 일치한다', () => {
    const e: MediasoupWsEventName = MEDIASOUP_WS_EVENTS.GET_RTP_CAPABILITIES;
    expect(e).toBe('mediasoup:getRtpCapabilities');
  });

  it('MediaType은 audio/video/screen 세 종류다', () => {
    expect(MEDIA_TYPES).toEqual(['audio', 'video', 'screen']);
    const m: MediaType = 'screen';
    expect(m).toBe('screen');
  });

  it('TransportDirection은 send/recv 두 종류다', () => {
    expect(TRANSPORT_DIRECTIONS).toEqual(['send', 'recv']);
    const d: TransportDirection = 'send';
    expect(d).toBe('send');
  });

  it('RPC 요청·응답 인터페이스는 wire format 형태로 인스턴스화할 수 있다', () => {
    // 컴파일 체크: 아래 12개 인터페이스가 모두 정의되어 있고
    // 필수 필드 시그니처가 일치하면 타입 체크가 통과한다.
    const a: GetRtpCapabilitiesRequest = { code: 'ABCDEFGH' };
    const b: GetRtpCapabilitiesResponse = { rtpCapabilities: {} };
    const c: CreateTransportRequest = { code: 'ABCDEFGH', direction: 'send' };
    const d: CreateTransportResponse = {
      id: 't1',
      iceParameters: {},
      iceCandidates: [],
      dtlsParameters: {},
    };
    const e: ConnectTransportRequest = {
      code: 'ABCDEFGH',
      transportId: 't1',
      dtlsParameters: {},
    };
    const f: ProduceRequest = {
      code: 'ABCDEFGH',
      transportId: 't1',
      kind: 'audio',
      source: 'audio',
      rtpParameters: {},
    };
    const g: ProduceResponse = { producerId: 'p1' };
    const h: ConsumeRequest = {
      code: 'ABCDEFGH',
      transportId: 't1',
      producerId: 'p1',
      rtpCapabilities: {},
    };
    const i: ConsumeResponse = {
      id: 'c1',
      producerId: 'p1',
      kind: 'audio',
      rtpParameters: {},
    };
    const j: ResumeConsumerRequest = { code: 'ABCDEFGH', consumerId: 'c1' };
    const k: NewProducerBroadcast = {
      peerSocketId: 's1',
      producerId: 'p1',
      kind: 'video',
      source: 'screen',
    };
    const l: ProducerClosedBroadcast = { producerId: 'p1' };
    const m: ConsumerClosedBroadcast = { consumerId: 'c1' };
    const n: ListProducersRequest = { code: 'ABCDEFGH' };
    const o: ListProducersResponse = { producers: [k] };
    const p: ToggleProducerRequest = {
      code: 'ABCDEFGH',
      producerId: 'p1',
      paused: true,
    };
    const q: ToggleProducerResponse = { ok: true };
    const r: ProducerToggledBroadcast = { producerId: 'p1', paused: true };
    const s: CloseProducerRequest = { code: 'ABCDEFGH', producerId: 'p1' };

    expect([a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r, s]).toHaveLength(19);
  });
});
