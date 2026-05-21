import { transcriptSegment } from '@/reports/domain/entries';
import { chatEntry } from '@/shared-kernel/domain/value-objects';

import { GeminiSummarizer, GeminiSummarizerOptions } from './gemini.summarizer';

/**
 * Gemini `generateContent` REST API (v1beta) 를 호출하는 SummarizerPort 어댑터 spec.
 *
 * 요청 형식:
 *   POST {baseUrl}/v1beta/models/{model}:generateContent?key={apiKey}
 *   body: { contents: [{ role: 'user', parts: [{ text }] }],
 *           generationConfig: { responseMimeType: 'application/json' } }
 *
 * 응답 형식:
 *   { candidates: [{ content: { parts: [{ text: '<json string>' }] } }] }
 *
 * 본 어댑터는 응답 text 를 JSON.parse 한 뒤 `reportSummary(...)` VO factory 로
 * 정규화한다(검증 실패는 그대로 throw 되어 Application Service 가 catch).
 */
describe('GeminiSummarizer', () => {
  const options: GeminiSummarizerOptions = {
    apiKey: 'TEST_KEY',
    model: 'gemini-2.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com',
    timeoutMs: 30000,
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

  it('body 에 transcript/chat 텍스트가 포함되고 responseMimeType=application/json 가 강제된다', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(okResponse(validSummaryJson));
    const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

    await summarizer.summarize({
      transcript: [
        transcriptSegment({ speaker: 'alice', text: 'OAuth 다음 분기 확정', startMs: 0, endMs: 2000 }),
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
    expect(promptText).toContain('alice');
    expect(promptText).toContain('OAuth 다음 분기 확정');
    expect(promptText).toContain('bob');
    expect(promptText).toContain('carol');
    expect(promptText).toContain('회의록 작성 부탁');
    // 메타데이터(code/시작·종료 시각)도 프롬프트에 포함돼야 한다.
    expect(promptText).toContain('abc12xyz');
  });

  it('응답 JSON 을 ReportSummary VO 로 변환해 돌려준다', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(okResponse(validSummaryJson));
    const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

    const summary = await summarizer.summarize({ transcript: [], chat: [], meta });
    expect(summary.title).toBe('주간 동기화');
    expect(summary.overview).toContain('OAuth 마이그레이션');
    expect(summary.decisions).toEqual(['OAuth 2.0 마이그레이션 다음 분기로 확정']);
    expect(summary.actionItems).toEqual([
      { owner: 'alice', task: '마이그레이션 PoC 작성', due: '이번 주 금요일' },
    ]);
    expect(summary.keyTopics).toEqual([
      { topic: '인증', points: ['JWT 정책', '세션 만료'] },
    ]);
  });

  it('빈 transcript + 빈 chat 도 정상 호출하고 응답을 매핑한다', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(okResponse(validSummaryJson));
    const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

    const summary = await summarizer.summarize({ transcript: [], chat: [], meta });
    expect(summary.title).toBe('주간 동기화');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('non-2xx 응답이면 status 가 포함된 에러를 throw 한다', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response('quota exceeded', { status: 429 }));
    const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

    await expect(summarizer.summarize({ transcript: [], chat: [], meta })).rejects.toThrow(
      /429/,
    );
  });

  it('fetch 자체가 reject 하면(예: 네트워크 실패) 그 에러를 그대로 전파한다', async () => {
    const fetchMock = jest.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

    await expect(summarizer.summarize({ transcript: [], chat: [], meta })).rejects.toThrow(
      /ECONNREFUSED/,
    );
  });

  it('candidates 가 비어 있으면 에러를 throw 한다', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ candidates: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

    await expect(summarizer.summarize({ transcript: [], chat: [], meta })).rejects.toThrow(
      /candidates/,
    );
  });

  it('응답 text 가 JSON 이 아니면 에러를 throw 한다', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(okResponse('not a json'));
    const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

    await expect(summarizer.summarize({ transcript: [], chat: [], meta })).rejects.toThrow();
  });

  it('JSON 은 valid 지만 ReportSummary VO 검증 실패면 에러를 그대로 전파한다(title 비어있음)', async () => {
    const invalid = JSON.stringify({
      title: '',
      overview: 'x',
      decisions: [],
      actionItems: [],
      keyTopics: [],
    });
    const fetchMock = jest.fn().mockResolvedValueOnce(okResponse(invalid));
    const summarizer = new GeminiSummarizer(options, fetchMock as unknown as typeof fetch);

    await expect(summarizer.summarize({ transcript: [], chat: [], meta })).rejects.toThrow(
      /title/,
    );
  });
});
