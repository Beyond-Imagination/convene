import type { AddressInfo } from 'node:net';

import {
  type CreateMeetingResponse,
  MEETING_WS_EVENTS,
  type ReportDetailResponse,
  type ReportListResponse,
} from '@convene/shared-interfaces';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test, TestingModule } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { AUDIO_CAPTURE } from '@/mediasoup/domain/ports';
import { TRANSCRIBER } from '@/recording/domain/ports';
import { SUMMARIZER } from '@/reports/domain/ports';
import { NoopSummarizer } from '@/reports/infrastructure/noop.summarizer';

import { NoopTranscriber } from './support/noop.transcriber';
import { NoopAudioCapture } from './support/noop-audio-capture';

/**
 * Reports의 e2e 통합 테스트.
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
 * meeting.ended → ReportMeetingLifecycleListener → createDraft
 *               → report.transcription.requested
 *               → RecordingReportLifecycleListener → RecordingService → NoopTranscriber
 *               → report.transcription.completed
 *               → ReportPipelineListener → completeTranscription
 *               → NoopSummarizer → report.summary.completed → report.finalized
 *
 * 모든 흐름이 비동기 이벤트로 연결돼 있으므로 controller 응답을 기다린 뒤
 * pipeline이 done/done으로 finalize 될 때까지 짧게 polling 한다.
 */
const waitForFinalizedReport = async (
  httpServer: ReturnType<INestApplication['getHttpServer']>,
  code: string,
  timeoutMs = 2000,
): Promise<ReportListResponse['items'][number]> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request(httpServer).get('/reports').expect(200);
    const body = res.body as ReportListResponse;
    const found = body.items.find((it) => it.code === code);
    if (found && found.pipeline.summaryStatus === 'done') return found;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error(`Report for code ${code} did not finalize within ${timeoutMs}ms`);
};

/** 회의 생성→채팅→종료→파이프라인 finalize까지 진행하고 회의록 목록 항목을 돌려준다. */
const createFinalizedReport = async (
  httpServer: ReturnType<INestApplication['getHttpServer']>,
  baseUrl: string,
): Promise<ReportListResponse['items'][number]> => {
  const created = await request(httpServer).post('/meetings').send({ source: 'web' }).expect(201);
  const createdBody = created.body as CreateMeetingResponse;
  const code = createdBody.code;

  const client = await connectClient(baseUrl);
  try {
    client.emit(MEETING_WS_EVENTS.JOIN, { code, nickname: 'alice' });
    await new Promise((r) => setTimeout(r, 30));
    client.emit(MEETING_WS_EVENTS.CHAT, { code, text: '회의 시작' });
    await new Promise((r) => setTimeout(r, 30));
  } finally {
    client.disconnect();
  }

  await request(httpServer)
    .delete(`/meetings/${code}`)
    .set('x-host-token', createdBody.hostToken)
    .expect(200);

  return waitForFinalizedReport(httpServer, code);
};

describe('Reports e2e', () => {
  let app: INestApplication;
  let baseUrl: string;
  let httpServer: ReturnType<INestApplication['getHttpServer']>;
  // 재요약 엔드포인트는 ADMIN_API_TOKEN으로 보호된다. AdminGuard가 모듈 초기화
  // 시점에 env를 읽으므로 테스트 모듈 생성 전에 토큰을 심는다.
  const ADMIN_TOKEN = 'e2e-admin-token';
  let prevAdminToken: string | undefined;

  beforeAll(async () => {
    prevAdminToken = process.env.ADMIN_API_TOKEN;
    process.env.ADMIN_API_TOKEN = ADMIN_TOKEN;
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // e2e 환경엔 ai-worker / ffmpeg / Gemini API 키가 없으므로 외부 의존 어댑터를
      // 모두 Noop으로 갈아끼운다. transcription 흐름은 빈 transcript로 done까지
      // 진행하고, NoopSummarizer가 placeholder 요약을 채워 finalize 한다.
      .overrideProvider(TRANSCRIBER)
      .useValue(new NoopTranscriber())
      .overrideProvider(AUDIO_CAPTURE)
      .useValue(new NoopAudioCapture())
      .overrideProvider(SUMMARIZER)
      .useValue(new NoopSummarizer())
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
    if (prevAdminToken === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = prevAdminToken;
  });

  it('회의 생성→채팅→종료 후 회의록이 목록/상세에서 노출된다', async () => {
    // 1) 회의 생성.
    const created = await request(httpServer).post('/meetings').send({ source: 'web' }).expect(201);
    const createdBody = created.body as CreateMeetingResponse;
    const code = createdBody.code;

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

    // 3) 회의 종료(이 시점에 meeting.ended 이벤트가 발행되고 listener가 createDraft를 호출).
    await request(httpServer)
      .delete(`/meetings/${code}`)
      .set('x-host-token', createdBody.hostToken)
      .expect(200);

    // 4) Recording → Reports 파이프라인이 done/done으로 finalize 될 때까지 폴링.
    const listItem = await waitForFinalizedReport(httpServer, code);
    expect(listItem.code).toBe(code);
    expect(listItem.source).toBe('web');
    expect(listItem.participantCount).toBe(1);
    expect(listItem.pipeline).toEqual({ sttStatus: 'done', summaryStatus: 'done' });
    // NoopSummarizer가 placeholder 요약(title="(요약 미적용)")을 채워 finalize 한다.
    expect(listItem.title).toBe('(요약 미적용)');

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
    // Recording BC + NoopTranscriber: STT 결과는 빈 transcript, 그 위에 NoopSummarizer가
    // placeholder summary를 적용해 두 stage 모두 done으로 finalize.
    expect(body.pipeline.sttStatus).toBe('done');
    expect(body.pipeline.summaryStatus).toBe('done');
    expect(body.pipeline.failures).toEqual([]);
    expect(body.transcript).toEqual([]);
    expect(body.summary?.title).toBe('(요약 미적용)');
  });

  it('존재하지 않는 report id는 404로 매핑된다', async () => {
    await request(httpServer).get('/reports/unknown-id').expect(404);
  });

  it('GET /reports?limit이 허용 범위를 벗어나면 400', async () => {
    await request(httpServer).get('/reports?limit=0').expect(400);
    await request(httpServer).get('/reports?limit=999').expect(400);
    await request(httpServer).get('/reports?limit=abc').expect(400);
  });

  describe('POST /reports/:id/resummarize (관리자 재요약)', () => {
    it('Authorization 헤더가 없으면 401', async () => {
      const report = await createFinalizedReport(httpServer, baseUrl);
      await request(httpServer).post(`/reports/${report.id}/resummarize`).expect(401);
    });

    it('잘못된 토큰이면 401', async () => {
      const report = await createFinalizedReport(httpServer, baseUrl);
      await request(httpServer)
        .post(`/reports/${report.id}/resummarize`)
        .set('Authorization', 'Bearer wrong-token')
        .expect(401);
    });

    it('올바른 Bearer 토큰이면 200으로 재요약된 상세를 돌려준다', async () => {
      const report = await createFinalizedReport(httpServer, baseUrl);
      const res = await request(httpServer)
        .post(`/reports/${report.id}/resummarize`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(200);
      const body = res.body as ReportDetailResponse;
      expect(body.id).toBe(report.id);
      // NoopSummarizer가 placeholder 요약을 다시 채워 summary stage는 done 유지.
      expect(body.pipeline.summaryStatus).toBe('done');
      expect(body.summary?.title).toBe('(요약 미적용)');
    });

    it('존재하지 않는 report id는 토큰이 맞아도 404', async () => {
      await request(httpServer)
        .post('/reports/unknown-id/resummarize')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(404);
    });
  });
});
