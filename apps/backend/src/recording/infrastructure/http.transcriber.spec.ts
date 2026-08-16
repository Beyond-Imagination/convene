import { HttpTranscriber, HttpTranscriberOptions } from './http.transcriber';

describe('HttpTranscriber', () => {
  // retryBaseDelayMs=0이면 백오프 대기가 0ms라 재시도 동작만 빠르게 검증할 수 있다.
  const options: HttpTranscriberOptions = {
    baseUrl: 'http://ai-worker:8000',
    maxAttempts: 3,
    retryBaseDelayMs: 0,
  };

  const okResponse = (body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  it('audio Buffer를 POST {baseUrl}/transcribe에 octet-stream으로 전송한다', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(okResponse({ segments: [] }));
    const transcriber = new HttpTranscriber(options, fetchMock as unknown as typeof fetch);
    const audio = Buffer.from([1, 2, 3, 4, 5]);

    await transcriber.transcribe({ meetingCode: 'abc12xyz', participantId: 's1', audio });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://ai-worker:8000/transcribe');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/octet-stream',
    );
    expect(init.body).toBe(audio);
  });

  it('응답의 segments를 TranscriptionSegmentPayload[]로 그대로 돌려준다', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      okResponse({
        segments: [
          { text: '안녕하세요', startMs: 0, endMs: 1200 },
          { text: '잘 들리시나요', startMs: 1200, endMs: 2500 },
        ],
      }),
    );
    const transcriber = new HttpTranscriber(options, fetchMock as unknown as typeof fetch);

    const result = await transcriber.transcribe({
      meetingCode: 'abc12xyz',
      participantId: 's1',
      audio: Buffer.from('x'),
    });
    expect(result).toEqual([
      { text: '안녕하세요', startMs: 0, endMs: 1200 },
      { text: '잘 들리시나요', startMs: 1200, endMs: 2500 },
    ]);
  });

  it('응답의 segments가 비어 있거나 누락이면 빈 배열을 돌려준다', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(okResponse({ segments: [] }))
      .mockResolvedValueOnce(okResponse({}));
    const transcriber = new HttpTranscriber(options, fetchMock as unknown as typeof fetch);
    expect(
      await transcriber.transcribe({
        meetingCode: 'a',
        participantId: 's1',
        audio: Buffer.from('x'),
      }),
    ).toEqual([]);
    expect(
      await transcriber.transcribe({
        meetingCode: 'b',
        participantId: 's1',
        audio: Buffer.from('x'),
      }),
    ).toEqual([]);
  });

  it('응답이 non-2xx 면 status가 포함된 에러를 throw 한다', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    const transcriber = new HttpTranscriber(options, fetchMock as unknown as typeof fetch);
    await expect(
      transcriber.transcribe({
        meetingCode: 'abc12xyz',
        participantId: 's1',
        audio: Buffer.from('x'),
      }),
    ).rejects.toThrow(/500/);
  });

  it('fetch 자체가 reject 하면(예: 네트워크 실패) 그 에러를 그대로 전파한다', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const transcriber = new HttpTranscriber(options, fetchMock as unknown as typeof fetch);
    await expect(
      transcriber.transcribe({
        meetingCode: 'abc12xyz',
        participantId: 's1',
        audio: Buffer.from('x'),
      }),
    ).rejects.toThrow(/ECONNREFUSED/);
  });

  /**
   * STT 실패 하나가 회의록 전체를 날린다 — 최종 전사는 chunk 하나만 throw 해도
   * `RecordingService`가 전체를 transcription.failed로 처리하고, 부분 전사는 이미 drain 한
   * 오디오라 실패하면 그 구간이 사라진다. ai-worker 재기동·과부하를 넘길 수 있어야 한다.
   */
  describe('재시도', () => {
    const audio = Buffer.from([9, 8, 7]);

    it('5xx 응답은 재시도하고, 성공하면 segments를 돌려준다', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(new Response('boom', { status: 503 }))
        .mockResolvedValueOnce(okResponse({ segments: [{ text: '네', startMs: 0, endMs: 300 }] }));
      const transcriber = new HttpTranscriber(options, fetchMock as unknown as typeof fetch);

      const result = await transcriber.transcribe({
        meetingCode: 'abc12xyz',
        participantId: 's1',
        audio,
      });
      expect(result).toEqual([{ text: '네', startMs: 0, endMs: 300 }]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('네트워크 실패(ai-worker 재기동 등)도 재시도한다', async () => {
      const fetchMock = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce(okResponse({ segments: [] }));
      const transcriber = new HttpTranscriber(options, fetchMock as unknown as typeof fetch);

      await transcriber.transcribe({ meetingCode: 'abc12xyz', participantId: 's1', audio });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('재시도할 때 같은 audio를 그대로 다시 보낸다', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(new Response('boom', { status: 503 }))
        .mockResolvedValueOnce(okResponse({ segments: [] }));
      const transcriber = new HttpTranscriber(options, fetchMock as unknown as typeof fetch);

      await transcriber.transcribe({ meetingCode: 'abc12xyz', participantId: 's1', audio });

      const [, retried] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(retried.body).toBe(audio);
    });

    it('4xx(요청 문제)는 재시도하지 않고 즉시 실패한다', async () => {
      const fetchMock = jest.fn().mockResolvedValue(new Response('bad request', { status: 400 }));
      const transcriber = new HttpTranscriber(options, fetchMock as unknown as typeof fetch);

      await expect(
        transcriber.transcribe({ meetingCode: 'abc12xyz', participantId: 's1', audio }),
      ).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('maxAttempts 만큼만 시도하고 마지막 에러를 전파한다', async () => {
      const fetchMock = jest.fn().mockResolvedValue(new Response('boom', { status: 503 }));
      const transcriber = new HttpTranscriber(options, fetchMock as unknown as typeof fetch);

      await expect(
        transcriber.transcribe({ meetingCode: 'abc12xyz', participantId: 's1', audio }),
      ).rejects.toThrow(/503/);
      expect(fetchMock).toHaveBeenCalledTimes(options.maxAttempts);
    });

    it('maxAttempts=1이면 재시도하지 않는다', async () => {
      const fetchMock = jest.fn().mockResolvedValue(new Response('boom', { status: 503 }));
      const transcriber = new HttpTranscriber(
        { ...options, maxAttempts: 1 },
        fetchMock as unknown as typeof fetch,
      );

      await expect(
        transcriber.transcribe({ meetingCode: 'abc12xyz', participantId: 's1', audio }),
      ).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
