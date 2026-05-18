import type { AddressInfo } from 'node:net';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { type Socket, io } from 'socket.io-client';

import {
  type CreateMeetingResponse,
  MEETING_WS_EVENTS,
  type ReportDetailResponse,
  type ReportListResponse,
} from '@migration/shared-interfaces';

import { AppModule } from '@/app.module';

/**
 * Reports bounded context의 e2e 통합 테스트.
 *
 * 흐름:
 *   1) HTTP create → WS join + chat → HTTP close
 *   2) meeting.ended 이벤트가 ReportMeetingLifecycleListener를 통해
 *      ReportFinalizationService.createDraft → completeTranscription(Noop)
 *      파이프라인을 비동기로 진행
 *   3) GET /reports 목록 / GET /reports/:id 상세에서 결과가 노출되는지 검증
 */

const connectClient = (url: string): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const client = io(url, { transports: ['websocket'], forceNew: true });
    client.once('connect', () => resolve(client));
    client.once('connect_error', (err) => reject(err));
  });

/**
 * meeting.ended → ReportMeetingLifecycleListener → createDraft 흐름은 비동기다.
 * v1 에는 Recording BC 가 없어 transcription.completed 이벤트가 자동 발행되지
 * 않으므로 draft 상태에서 멈춘다. listener의 createDraft 호출이 완료될 때까지
 * 짧게 polling 한다.
 */
const waitForReport = async (
  httpServer: ReturnType<INestApplication['getHttpServer']>,
  code: string,
  timeoutMs = 1000,
): Promise<ReportListResponse['items'][number]> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request(httpServer).get('/reports').expect(200);
    const body = res.body as ReportListResponse;
    const found = body.items.find((it) => it.code === code);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error(`Report for code ${code} did not appear within ${timeoutMs}ms`);
};

describe('Reports e2e', () => {
  let app: INestApplication;
  let baseUrl: string;
  let httpServer: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

  it('회의 생성→채팅→종료 후 회의록이 목록/상세에서 노출된다', async () => {
    // 1) 회의 생성.
    const created = await request(httpServer)
      .post('/meetings')
      .send({ source: 'web' })
      .expect(201);
    const code = (created.body as CreateMeetingResponse).code;

    // 2) WS 입장 + 채팅.
    const alice = await connectClient(baseUrl);
    try {
      alice.emit(MEETING_WS_EVENTS.JOIN, { code, nickname: 'alice' });
      await new Promise((r) => setTimeout(r, 30));
      alice.emit(MEETING_WS_EVENTS.CHAT, { code, text: '회의 시작' });
      await new Promise((r) => setTimeout(r, 30));
    } finally {
      alice.disconnect();
    }

    // 3) 회의 종료(이 시점에 meeting.ended 이벤트가 발행되고 listener 가 createDraft 를 호출).
    await request(httpServer).delete(`/meetings/${code}`).expect(200);

    // 4) GET /reports 에서 회의록 카드가 노출될 때까지 폴링.
    const listItem = await waitForReport(httpServer, code);
    expect(listItem.code).toBe(code);
    expect(listItem.source).toBe('web');
    expect(listItem.participantCount).toBe(1);

    // 5) GET /reports/:id 상세 응답 검증.
    const detail = await request(httpServer).get(`/reports/${listItem.id}`).expect(200);
    const body = detail.body as ReportDetailResponse;
    expect(body.id).toBe(listItem.id);
    expect(body.code).toBe(code);
    expect(body.meetingId).toBe(code); // v1: Meeting 식별자=code
    expect(body.participants).toHaveLength(1);
    expect(body.participants[0].nickname).toBe('alice');
    expect(body.chat).toHaveLength(1);
    expect(body.chat[0]).toEqual({
      nickname: 'alice',
      text: '회의 시작',
      sentAt: expect.any(String),
    });
    // v1: Recording BC 가 없어 report.transcription.completed/failed 가 발행되지 않는다.
    // 따라서 createDraft 직후 pipeline 은 두 stage 모두 pending 으로 멈춰 있다.
    // Recording BC 도입 시 본 spec 의 기대값을 done/skip 으로 갱신한다.
    expect(body.pipeline.sttStatus).toBe('pending');
    expect(body.pipeline.summaryStatus).toBe('pending');
    expect(body.summary).toBeNull();
  });

  it('존재하지 않는 report id는 404로 매핑된다', async () => {
    await request(httpServer).get('/reports/unknown-id').expect(404);
  });

  it('GET /reports?limit이 허용 범위를 벗어나면 400', async () => {
    await request(httpServer).get('/reports?limit=0').expect(400);
    await request(httpServer).get('/reports?limit=999').expect(400);
    await request(httpServer).get('/reports?limit=abc').expect(400);
  });
});
