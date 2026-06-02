import type { AddressInfo } from 'node:net';

import {
  type CreateMeetingResponse,
  MEETING_WS_EVENTS,
  type ReportDetailResponse,
  type ReportListResponse,
} from '@migration/shared-interfaces';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test, TestingModule } from '@nestjs/testing';
import { io,type Socket } from 'socket.io-client';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { FfmpegAudioCaptureAdapter } from '@/mediasoup/infrastructure/ffmpeg-audio-capture.adapter';
import { NoopAudioCapture } from '@/mediasoup/infrastructure/noop-audio-capture.adapter';
import { HttpTranscriber } from '@/recording/infrastructure/http.transcriber';
import { NoopTranscriber } from '@/recording/infrastructure/noop.transcriber';
import { GeminiSummarizer } from '@/reports/infrastructure/gemini.summarizer';
import { NoopSummarizer } from '@/reports/infrastructure/noop.summarizer';

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
 * meeting.ended → ReportMeetingLifecycleListener → createDraft
 *               → report.transcription.requested
 *               → RecordingReportLifecycleListener → RecordingService → NoopTranscriber
 *               → report.transcription.completed
 *               → ReportPipelineListener → completeTranscription
 *               → NoopSummarizer → report.summary.completed → report.finalized
 *
 * 모든 흐름이 비동기 이벤트로 연결돼 있으므로 controller 응답을 기다린 뒤
 * pipeline 이 done/done 으로 finalize 될 때까지 짧게 polling 한다.
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

describe('Reports e2e', () => {
  let app: INestApplication;
  let baseUrl: string;
  let httpServer: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // e2e 환경엔 ai-worker / ffmpeg / Gemini API 키가 없으므로 외부 의존 어댑터를
      // 모두 Noop 으로 갈아끼운다. transcription 흐름은 빈 transcript 로 done 까지
      // 진행하고, NoopSummarizer 가 placeholder 요약을 채워 finalize 한다.
      .overrideProvider(HttpTranscriber)
      .useValue(new NoopTranscriber())
      .overrideProvider(FfmpegAudioCaptureAdapter)
      .useValue(new NoopAudioCapture())
      .overrideProvider(GeminiSummarizer)
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
  });

  it('회의 생성→채팅→종료 후 회의록이 목록/상세에서 노출된다', async () => {
    // 1) 회의 생성.
    const created = await request(httpServer)
      .post('/meetings')
      .send({ source: 'web' })
      .expect(201);
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

    // 3) 회의 종료(이 시점에 meeting.ended 이벤트가 발행되고 listener 가 createDraft 를 호출).
    await request(httpServer)
      .delete(`/meetings/${code}`)
      .set('x-host-token', createdBody.hostToken)
      .expect(200);

    // 4) Recording → Reports 파이프라인이 done/done 으로 finalize 될 때까지 폴링.
    const listItem = await waitForFinalizedReport(httpServer, code);
    expect(listItem.code).toBe(code);
    expect(listItem.source).toBe('web');
    expect(listItem.participantCount).toBe(1);
    expect(listItem.pipeline).toEqual({ sttStatus: 'done', summaryStatus: 'done' });
    // NoopSummarizer 가 placeholder 요약(title="(요약 미적용)")을 채워 finalize 한다.
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
    // Recording BC + NoopTranscriber: STT 결과는 빈 transcript, 그 위에 NoopSummarizer 가
    // placeholder summary 를 적용해 두 stage 모두 done 으로 finalize.
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
});
