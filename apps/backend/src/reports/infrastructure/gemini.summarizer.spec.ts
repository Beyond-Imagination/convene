import { transcriptSegment } from '@/reports/domain/entries/transcript-segment';
import { chatEntry } from '@/shared-kernel/domain/value-objects/chat-entry';

import { GeminiSummarizer, GeminiSummarizerOptions } from './gemini.summarizer';

/**
 * Gemini `generateContent` REST API를 호출하는 SummarizerPort 어댑터 spec.
 *
 * 요청 형식:
 *   POST {baseUrl}/v1beta/models/{model}:generateContent?key={apiKey}
 *   body: { contents: [{ role: 'user', parts: [{ text }] }],
 *           generationConfig: { responseMimeType: 'application/json' } }
 *
 * 응답 형식:
 *   { candidates: [{ content: { parts: [{ text: '<json string>' }] } }] }
 */
describe('GeminiSummarizer', () => {
  // retryBaseDelayMs=0이면 백오프 대기가 0ms라 재시도 동작만 빠르게 검증할 수 있다.
  const options: GeminiSummarizerOptions = {
    apiKey: 'TEST_KEY',
    model: 'gemini-2.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com',
    timeoutMs: 30000,
    maxAttempts: 3,
    retryBaseDelayMs: 0,
  };

  const meta = {
    meetingId: 'mtg-1',
    code: 'abc12xyz',
    startedAt: new Date('2026-05-21T10:00:00Z'),
    endedAt: new Date('2026-05-21T10:30:00Z'),
  };

  const okResponse = (text: string): Response =>
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text }] } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  const validSummaryJson = JSON.stringify({
    title: '주간 동기화',
    overview: 'OAuth 마이그레이션 진행 상황과 다음 스프린트 작업을 정리했다.',
    decisions: ['OAuth 2.0 마이그레이션 다음 분기로 확정'],
    actionItems: [{ owner: 'alice', task: '마이그레이션 PoC 작성', due: '이번 주 금요일' }],
    keyTopics: [{ topic: '인증', points: ['JWT 정책', '세션 만료'] }],
  });

  it('POST {baseUrl}/v1beta/models/{model}:generateContent?key=... 로 호출한다', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(okResponse(validSummaryJson));
    const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

    await summarizer.summarize({ transcript: [], chat: [], meta });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=TEST_KEY',
    );
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('body에 transcript/chat 텍스트가 포함되고 responseMimeType=application/json가 강제된다', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(okResponse(validSummaryJson));
    const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

    await summarizer.summarize({
      transcript: [
        transcriptSegment({
          speaker: 'alice',
          text: 'OAuth 다음 분기 확정',
          startMs: 0,
          endMs: 2000,
        }),
        transcriptSegment({ speaker: 'bob', text: '동의합니다', startMs: 2000, endMs: 3000 }),
      ],
      chat: [chatEntry({ nickname: 'carol', text: '회의록 작성 부탁', sentAt: meta.startedAt })],
      meta,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      generationConfig: { responseMimeType: string };
    };
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0].role).toBe('user');
    const promptText = body.contents[0].parts[0].text;
    // 데이터(transcript/chat) 본문은 원본(한국어) 그대로 들어간다.
    expect(promptText).toContain('alice');
    expect(promptText).toContain('OAuth 다음 분기 확정');
    expect(promptText).toContain('bob');
    expect(promptText).toContain('carol');
    expect(promptText).toContain('회의록 작성 부탁');
    // 메타데이터(code/시작·종료 시각)도 프롬프트에 포함돼야 한다.
    expect(promptText).toContain('abc12xyz');
    // 지시문/스키마는 영어로 작성되며, 결과는 한국어로 응답하라고 명시한다.
    expect(promptText).toContain('Transcript');
    expect(promptText).toContain('Chat');
    expect(promptText).toContain('Korean');
  });

  it('generationConfig에 낮은 temperature와 5필드 responseSchema가 강제된다', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(okResponse(validSummaryJson));
    const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

    await summarizer.summarize({ transcript: [], chat: [], meta });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      generationConfig: {
        responseMimeType: string;
        temperature: number;
        responseSchema: {
          type: string;
          properties: Record<string, { type: string }>;
          required: string[];
          propertyOrdering?: string[];
        };
      };
    };
    // 요약 일관성을 위해 temperature를 낮춘다(Gemini default 1.0 → 0.2).
    expect(body.generationConfig.temperature).toBeLessThanOrEqual(0.2);
    // 모델단에서 5필드 JSON 구조를 강제해 어댑터 파싱부의 throw 빈도를 낮춘다.
    const schema = body.generationConfig.responseSchema;
    // REST v1beta Schema의 type은 대문자 enum(OBJECT/STRING/ARRAY).
    expect(schema.type).toBe('OBJECT');
    expect(Object.keys(schema.properties).sort()).toEqual([
      'actionItems',
      'decisions',
      'keyTopics',
      'overview',
      'title',
    ]);
    expect(schema.required).toEqual(
      expect.arrayContaining(['title', 'overview', 'decisions', 'actionItems', 'keyTopics']),
    );
    // 중첩 배열 구조(actionItems/keyTopics)도 스키마에 명시한다.
    expect(schema.properties.actionItems.type).toBe('ARRAY');
    expect(schema.properties.keyTopics.type).toBe('ARRAY');
  });

  it('응답 JSON을 ReportSummary VO로 변환해 돌려준다', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(okResponse(validSummaryJson));
    const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

    const summary = await summarizer.summarize({ transcript: [], chat: [], meta });
    expect(summary.title).toBe('주간 동기화');
    expect(summary.overview).toContain('OAuth 마이그레이션');
    expect(summary.decisions).toEqual(['OAuth 2.0 마이그레이션 다음 분기로 확정']);
    expect(summary.actionItems).toEqual([
      { owner: 'alice', task: '마이그레이션 PoC 작성', due: '이번 주 금요일' },
    ]);
    expect(summary.keyTopics).toEqual([{ topic: '인증', points: ['JWT 정책', '세션 만료'] }]);
  });

  it('빈 transcript + 빈 chat도 정상 호출하고 응답을 매핑한다', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(okResponse(validSummaryJson));
    const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

    const summary = await summarizer.summarize({ transcript: [], chat: [], meta });
    expect(summary.title).toBe('주간 동기화');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('non-2xx 응답이면 status가 포함된 에러를 throw 한다', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('bad request', { status: 400 }));
    const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

    await expect(summarizer.summarize({ transcript: [], chat: [], meta })).rejects.toThrow(/400/);
  });

  it('fetch 자체가 reject 하면(예: 네트워크 실패) 그 에러를 그대로 전파한다', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

    await expect(summarizer.summarize({ transcript: [], chat: [], meta })).rejects.toThrow(
      /ECONNREFUSED/,
    );
  });

  it('candidates가 비어 있으면 에러를 throw 한다', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ candidates: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

    // 구체 문구가 아니라 "빈 candidates면 실패한다"는 동작만 단언한다.
    await expect(summarizer.summarize({ transcript: [], chat: [], meta })).rejects.toThrow();
  });

  it('응답 text가 JSON이 아니면 에러를 throw 한다', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(okResponse('not a json'));
    const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

    await expect(summarizer.summarize({ transcript: [], chat: [], meta })).rejects.toThrow();
  });

  it('JSON은 valid 지만 ReportSummary VO 검증 실패면 에러를 그대로 전파한다(title 비어있음)', async () => {
    const invalid = JSON.stringify({
      title: '',
      overview: 'x',
      decisions: [],
      actionItems: [],
      keyTopics: [],
    });
    const fetchMock = jest.fn().mockResolvedValueOnce(okResponse(invalid));
    const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

    await expect(summarizer.summarize({ transcript: [], chat: [], meta })).rejects.toThrow(/title/);
  });

  /**
   * 외부 API라 일시적 실패(rate limit·서버 오류·네트워크 단절)가 정상 경로에 섞여 들어온다.
   * 다시 호출하면 결과가 달라질 수 있는 실패만 재시도하고, 그렇지 않은 실패는 즉시 포기한다.
   */
  describe('재시도', () => {
    it('5xx 응답은 재시도하고, 성공하면 요약을 돌려준다', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
        .mockResolvedValueOnce(okResponse(validSummaryJson));
      const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

      const summary = await summarizer.summarize({ transcript: [], chat: [], meta });
      expect(summary.title).toBe('주간 동기화');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('429(rate limit) 응답도 재시도한다', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(new Response('quota exceeded', { status: 429 }))
        .mockResolvedValueOnce(okResponse(validSummaryJson));
      const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

      await summarizer.summarize({ transcript: [], chat: [], meta });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('네트워크 실패(fetch reject)도 재시도한다', async () => {
      const fetchMock = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce(okResponse(validSummaryJson));
      const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

      await summarizer.summarize({ transcript: [], chat: [], meta });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('4xx(요청·인증 문제)는 재시도하지 않고 즉시 실패한다', async () => {
      const fetchMock = jest.fn().mockResolvedValue(new Response('forbidden', { status: 403 }));
      const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

      await expect(summarizer.summarize({ transcript: [], chat: [], meta })).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('응답 본문 파싱 실패는 재시도하지 않는다', async () => {
      const fetchMock = jest.fn().mockResolvedValue(okResponse('not a json'));
      const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

      await expect(summarizer.summarize({ transcript: [], chat: [], meta })).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('maxAttempts 만큼만 시도하고 마지막 에러를 전파한다', async () => {
      const fetchMock = jest.fn().mockResolvedValue(new Response('unavailable', { status: 503 }));
      const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

      await expect(summarizer.summarize({ transcript: [], chat: [], meta })).rejects.toThrow(/503/);
      expect(fetchMock).toHaveBeenCalledTimes(options.maxAttempts);
    });

    it('maxAttempts=1이면 재시도하지 않는다', async () => {
      const fetchMock = jest.fn().mockResolvedValue(new Response('unavailable', { status: 503 }));
      const summarizer = new GeminiSummarizer(
        { ...options, maxAttempts: 1 },
        fetchMock as unknown as typeof fetch,
      );

      await expect(summarizer.summarize({ transcript: [], chat: [], meta })).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('재시도 전에 백오프만큼 실제로 기다린다', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
        .mockResolvedValueOnce(okResponse(validSummaryJson));
      const summarizer = new GeminiSummarizer(
        { ...options, retryBaseDelayMs: 60 },
        fetchMock as unknown as typeof fetch,
      );

      const startedAt = Date.now();
      await summarizer.summarize({ transcript: [], chat: [], meta });
      // jitter가 걸리므로 정확한 값이 아니라 하한(상한의 절반)만 단언한다.
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(25);
    });
  });
});
