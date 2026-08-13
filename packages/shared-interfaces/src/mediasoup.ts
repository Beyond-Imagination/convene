/*
 * Mediasoup의 WebSocket wire format.
 *
 * 본 파일은 frontend ↔ backend가 공유하는 **순수 TS 인터페이스 / literal 타입**만 정의한다.
 * mediasoup 라이브러리에 의존하지 않기 위해 RTP 관련 구조체는 `unknown`으로 노출하고, 양측이 각자의 라이브러리 타입으로 cast 한다.
 */

export const MEDIA_TYPES = ['audio', 'video', 'screen'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/**
 * Mediasoup의 WebSocket 이벤트 이름.
 *
 * 도메인 이벤트(`meeting.*` dot prefix)와 구분하기 위해 colon prefix를 사용한다.
 *   - `mediasoup:getRtpCapabilities` / `mediasoup:createTransport` /
 *     `mediasoup:connectTransport` / `mediasoup:produce` / `mediasoup:consume` /
 *     `mediasoup:resumeConsumer`
 *     — client → server 요청 (Socket.IO ack 기반 RPC)
 *   - `mediasoup:newProducer` / `mediasoup:producerClosed` / `mediasoup:consumerClosed`
 *     — server → client 브로드캐스트
 */
export const MEDIASOUP_WS_EVENTS = {
  GET_RTP_CAPABILITIES: 'mediasoup:getRtpCapabilities',
  CREATE_TRANSPORT: 'mediasoup:createTransport',
  CONNECT_TRANSPORT: 'mediasoup:connectTransport',
  PRODUCE: 'mediasoup:produce',
  CONSUME: 'mediasoup:consume',
  RESUME_CONSUMER: 'mediasoup:resumeConsumer',
  LIST_PRODUCERS: 'mediasoup:listProducers',
  TOGGLE_PRODUCER: 'mediasoup:toggleProducer',
  CLOSE_PRODUCER: 'mediasoup:closeProducer',
  /** 경로가 바뀐 재연결(WiFi↔LTE, NAT rebind)에서 producer·consumer를 보존한 채 연결만 복구한다. */
  RESTART_ICE: 'mediasoup:restartIce',
  NEW_PRODUCER: 'mediasoup:newProducer',
  PRODUCER_CLOSED: 'mediasoup:producerClosed',
  CONSUMER_CLOSED: 'mediasoup:consumerClosed',
  PRODUCER_TOGGLED: 'mediasoup:producerToggled',
} as const;

export type MediasoupWsEventName = (typeof MEDIASOUP_WS_EVENTS)[keyof typeof MEDIASOUP_WS_EVENTS];

/**
 * Transport의 방향. mediasoup-client `Device.createSendTransport` / `createRecvTransport`에 대응.
 */
export const TRANSPORT_DIRECTIONS = ['send', 'recv'] as const;
export type TransportDirection = (typeof TRANSPORT_DIRECTIONS)[number];

// ---------- client → server: RPC 요청 ----------

export interface GetRtpCapabilitiesRequest {
  code: string;
}

export interface GetRtpCapabilitiesResponse {
  rtpCapabilities: unknown;
}

export interface CreateTransportRequest {
  code: string;
  direction: TransportDirection;
}

export interface CreateTransportResponse {
  id: string;
  iceParameters: unknown;
  iceCandidates: unknown;
  dtlsParameters: unknown;
}

export interface ConnectTransportRequest {
  code: string;
  transportId: string;
  dtlsParameters: unknown;
}

export interface ProduceRequest {
  code: string;
  transportId: string;
  kind: 'audio' | 'video';
  source: MediaType;
  rtpParameters: unknown;
  paused?: boolean;
}

export interface ProduceResponse {
  producerId: string;
}

export interface ConsumeRequest {
  code: string;
  transportId: string;
  producerId: string;
  rtpCapabilities: unknown;
}

export interface ConsumeResponse {
  id: string;
  producerId: string;
  kind: 'audio' | 'video';
  rtpParameters: unknown;
}

export interface ResumeConsumerRequest {
  code: string;
  consumerId: string;
}

export interface RestartIceRequest {
  code: string;
  transportId: string;
}

export interface RestartIceResponse {
  iceParameters: unknown;
}

/**
 * 회의에 늦게 입장한 참가자가 기존 producer 들을 받아오기 위해 호출하는 RPC.
 * 자기 자신의 producer는 제외한다. 응답을 받은 클라이언트는 각 항목을
 * `NEW_PRODUCER` 브로드캐스트와 동일하게 처리(`CONSUME` → resume)한다.
 */
export interface ListProducersRequest {
  code: string;
}

export interface ListProducersResponse {
  producers: NewProducerBroadcast[];
}

/**
 * 자기 자신의 producer를 일시정지(mute)/재개(unmute)하는 RPC.
 * `paused: true` 면 mediasoup `producer.pause()`, `false` 면 `producer.resume()`.
 * 처리 후 server가 같은 회의의 다른 참가자에게 `PRODUCER_TOGGLED`를 broadcast 한다.
 */
export interface ToggleProducerRequest {
  code: string;
  producerId: string;
  paused: boolean;
}

export interface ToggleProducerResponse {
  ok: true;
}

/**
 * 자기 producer를 닫는다(예: 화면 공유 중지).
 * 서버가 producer를 제거하고 같은 회의에 `PRODUCER_CLOSED`를 broadcast 해 다른 참가자가 정리하게 한다.
 * 화면 공유 동시 1인 제약을 서버가 정확히 강제하려면 중지도 서버가 알아야 한다.
 */
export interface CloseProducerRequest {
  code: string;
  producerId: string;
}

// ---------- server → client: 브로드캐스트 ----------

/**
 * 같은 회의의 다른 참가자가 새 Producer를 만들었음을 알린다.
 * 수신 측은 `mediasoup:consume`으로 이어서 구독한다.
 */
export interface NewProducerBroadcast {
  peerId: string;
  producerId: string;
  kind: 'audio' | 'video';
  source: MediaType;
  paused?: boolean;
}

export interface ProducerClosedBroadcast {
  producerId: string;
}

export interface ConsumerClosedBroadcast {
  consumerId: string;
}

/**
 * 같은 회의의 다른 참가자가 자기 producer를 mute/unmute 했음을 알린다.
 * 수신 측은 해당 producerId의 remote tile에 mute 상태를 반영한다.
 */
export interface ProducerToggledBroadcast {
  producerId: string;
  paused: boolean;
}
