import type { AddressInfo } from 'node:net';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { type Socket, io } from 'socket.io-client';

import {
  type ChatPostedBroadcast,
  type CloseMeetingResponse,
  type CreateMeetingResponse,
  type CreateTransportResponse,
  type GetRtpCapabilitiesResponse,
  MEDIASOUP_WS_EVENTS,
  MEETING_WS_EVENTS,
  type ParticipantJoinedBroadcast,
  type ParticipantLeftBroadcast,
} from '@migration/shared-interfaces';

import { AppModule } from '@/app.module';
import { FfmpegAudioCaptureAdapter } from '@/mediasoup/infrastructure/ffmpeg-audio-capture.adapter';
import { NoopAudioCapture } from '@/mediasoup/infrastructure/noop-audio-capture.adapter';
import { HttpTranscriber } from '@/recording/infrastructure/http.transcriber';
import { NoopTranscriber } from '@/recording/infrastructure/noop.transcriber';

/**
 * Meeting bounded context의 e2e 통합 테스트.
 *
 * 흐름: HTTP create → 두 client WS join → 한쪽 chat broadcast 확인 →
 *      leave broadcast 확인 → HTTP close.
 */

const waitFor = <T>(socket: Socket, event: string): Promise<T> =>
  new Promise((resolve) => {
    socket.once(event, (payload: T) => resolve(payload));
  });

const connectClient = (url: string): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const client = io(url, { transports: ['websocket'], forceNew: true });
    client.once('connect', () => resolve(client));
    client.once('connect_error', (err) => reject(err));
  });

describe('Meeting e2e', () => {
  let app: INestApplication;
  let baseUrl: string;
  let httpServer: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // e2e 환경엔 ai-worker 컨테이너 / ffmpeg 바이너리가 없으므로 외부 의존
      // 어댑터를 모두 Noop 으로 갈아끼운다.
      .overrideProvider(HttpTranscriber)
      .useValue(new NoopTranscriber())
      .overrideProvider(FfmpegAudioCaptureAdapter)
      .useValue(new NoopAudioCapture())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    httpServer = app.getHttpServer();
    const address = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('HTTP create → WS join/chat/leave → HTTP close 전 흐름', async () => {
    // 1) 회의 생성.
    const created = await request(httpServer)
      .post('/meetings')
      .send({ source: 'web' })
      .expect(201);
    const createBody = created.body as CreateMeetingResponse;
    expect(createBody.code).toHaveLength(8);
    expect(createBody.source).toBe('web');
    const code = createBody.code;

    // 2) 두 client 접속.
    const alice = await connectClient(baseUrl);
    const bob = await connectClient(baseUrl);

    try {
      // 3) alice join (bob은 아직 안 들어옴 → broadcast 없음).
      alice.emit(MEETING_WS_EVENTS.JOIN, { code, nickname: 'alice' });

      // 4) bob join → alice가 participantJoined 받음.
      const aliceGotJoin = waitFor<ParticipantJoinedBroadcast>(
        alice,
        MEETING_WS_EVENTS.PARTICIPANT_JOINED,
      );
      // 작은 지연으로 alice의 join이 먼저 처리되도록 양보.
      await new Promise((r) => setTimeout(r, 30));
      bob.emit(MEETING_WS_EVENTS.JOIN, { code, nickname: 'bob' });
      const joinPayload = await aliceGotJoin;
      expect(joinPayload.nickname).toBe('bob');
      expect(joinPayload.socketId).toBe(bob.id);

      // 5) alice가 chat 발화 → bob도 alice도 chatPosted 수신.
      const aliceGotChat = waitFor<ChatPostedBroadcast>(
        alice,
        MEETING_WS_EVENTS.CHAT_POSTED,
      );
      const bobGotChat = waitFor<ChatPostedBroadcast>(
        bob,
        MEETING_WS_EVENTS.CHAT_POSTED,
      );
      alice.emit(MEETING_WS_EVENTS.CHAT, { code, text: 'hello bob' });
      const [aliceChat, bobChat] = await Promise.all([aliceGotChat, bobGotChat]);
      expect(aliceChat).toEqual({
        nickname: 'alice',
        text: 'hello bob',
        sentAt: expect.any(String),
      });
      expect(bobChat).toEqual(aliceChat);

      // 6) bob leave → alice가 participantLeft 수신.
      const aliceGotLeft = waitFor<ParticipantLeftBroadcast>(
        alice,
        MEETING_WS_EVENTS.PARTICIPANT_LEFT,
      );
      bob.emit(MEETING_WS_EVENTS.LEAVE, { code });
      const leftPayload = await aliceGotLeft;
      expect(leftPayload.socketId).toBe(bob.id);
    } finally {
      alice.disconnect();
      bob.disconnect();
    }

    // 7) 회의 종료.
    const closed = await request(httpServer)
      .delete(`/meetings/${code}`)
      .expect(200);
    const closeBody = closed.body as CloseMeetingResponse;
    expect(closeBody.code).toBe(code);
    expect(typeof closeBody.endedAt).toBe('string');
  });

  it('잘못된 code로 POST /meetings/:code DELETE 요청은 400', async () => {
    await request(httpServer).delete('/meetings/short').expect(400);
  });

  it('존재하지 않는 회의 종료는 404 NotFound로 매핑된다', async () => {
    await request(httpServer).delete('/meetings/00000000').expect(404);
  });

  it('HTTP create → WS join → mediasoup:getRtpCapabilities + createTransport 까지 시그널링 동작', async () => {
    const created = await request(httpServer)
      .post('/meetings')
      .send({ source: 'web' })
      .expect(201);
    const code = (created.body as CreateMeetingResponse).code;

    const alice = await connectClient(baseUrl);
    try {
      alice.emit(MEETING_WS_EVENTS.JOIN, { code, nickname: 'alice' });
      // Meeting BC join 처리 후 mediasoup admitParticipant lifecycle 이 완료될 시간 양보.
      await new Promise((r) => setTimeout(r, 80));

      const caps = (await alice.emitWithAck(MEDIASOUP_WS_EVENTS.GET_RTP_CAPABILITIES, {
        code,
      })) as GetRtpCapabilitiesResponse;
      expect(caps).toHaveProperty('rtpCapabilities');
      expect((caps.rtpCapabilities as { codecs?: unknown[] }).codecs).toBeDefined();

      const transport = (await alice.emitWithAck(MEDIASOUP_WS_EVENTS.CREATE_TRANSPORT, {
        code,
        direction: 'send',
      })) as CreateTransportResponse;
      expect(typeof transport.id).toBe('string');
      expect(transport.id.length).toBeGreaterThan(0);
      expect(transport.iceParameters).toEqual(
        expect.objectContaining({
          usernameFragment: expect.any(String),
        }),
      );
    } finally {
      alice.disconnect();
    }

    await request(httpServer).delete(`/meetings/${code}`).expect(200);
  });

  it('잘못된 WS payload는 exception 이벤트로 client에 전달되고 broadcast는 발생하지 않는다', async () => {
    const created = await request(httpServer).post('/meetings').send({ source: 'web' }).expect(201);
    const code = (created.body as CreateMeetingResponse).code;

    const alice = await connectClient(baseUrl);
    const bob = await connectClient(baseUrl);

    try {
      // bob을 먼저 정상 join 시켜 둠 — alice의 invalid join이 broadcast를 일으키면 bob이 받게 됨.
      bob.emit(MEETING_WS_EVENTS.JOIN, { code, nickname: 'bob' });
      await new Promise((r) => setTimeout(r, 30));

      // bob이 participantJoined를 받으면 안 됨 (invalid payload는 service까지 도달 X).
      const bobGotJoinAfter = new Promise<ParticipantJoinedBroadcast | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), 200);
        bob.once(MEETING_WS_EVENTS.PARTICIPANT_JOINED, (payload: ParticipantJoinedBroadcast) => {
          clearTimeout(timer);
          resolve(payload);
        });
      });

      const aliceGotException = new Promise<unknown>((resolve) => {
        alice.once('exception', (payload: unknown) => resolve(payload));
      });

      // code 길이 위반: 8자가 아니라 5자.
      alice.emit(MEETING_WS_EVENTS.JOIN, { code: 'short', nickname: 'alice' });

      const exceptionPayload = (await aliceGotException) as Record<string, unknown>;
      expect(exceptionPayload).toBeDefined();
      // WS 컨텍스트라 HTTP semantic(statusCode, error: 'Bad Request')은 누설하지 않는다.
      expect(exceptionPayload).not.toHaveProperty('statusCode');
      expect(exceptionPayload.status).toBe('error');
      // 'Internal server error'로 가려지면 안 되고, validation 정보가 client에 전달돼야 한다.
      expect(JSON.stringify(exceptionPayload.message)).toMatch(/validation|code/i);

      const broadcast = await bobGotJoinAfter;
      expect(broadcast).toBeNull();
    } finally {
      alice.disconnect();
      bob.disconnect();
    }
  });
});
