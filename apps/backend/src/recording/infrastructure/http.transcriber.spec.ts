import { HttpTranscriber } from './http.transcriber';

describe('HttpTranscriber', () => {
  const baseUrl = 'http://ai-worker:8000';

  const okResponse = (body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  it('audio Buffer를 POST {baseUrl}/transcribe에 octet-stream으로 전송한다', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(okResponse({ segments: [] }));
    const transcriber = new HttpTranscriber(baseUrl, fetchMock as unknown as typeof fetch);
    const audio = Buffer.from([1, 2, 3, 4, 5]);

    await transcriber.transcribe({ meetingCode: 'abc12xyz', audio });

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
    const transcriber = new HttpTranscriber(baseUrl, fetchMock as unknown as typeof fetch);

    const result = await transcriber.transcribe({
      meetingCode: 'abc12xyz',
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
    const transcriber = new HttpTranscriber(baseUrl, fetchMock as unknown as typeof fetch);
    expect(await transcriber.transcribe({ meetingCode: 'a', audio: Buffer.from('x') })).toEqual([]);
    expect(await transcriber.transcribe({ meetingCode: 'b', audio: Buffer.from('x') })).toEqual([]);
  });

  it('응답이 non-2xx 면 status가 포함된 에러를 throw 한다', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const transcriber = new HttpTranscriber(baseUrl, fetchMock as unknown as typeof fetch);
    await expect(
      transcriber.transcribe({ meetingCode: 'abc12xyz', audio: Buffer.from('x') }),
    ).rejects.toThrow(/500/);
  });

  it('fetch 자체가 reject 하면(예: 네트워크 실패) 그 에러를 그대로 전파한다', async () => {
    const fetchMock = jest.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const transcriber = new HttpTranscriber(baseUrl, fetchMock as unknown as typeof fetch);
    await expect(
      transcriber.transcribe({ meetingCode: 'abc12xyz', audio: Buffer.from('x') }),
    ).rejects.toThrow(/ECONNREFUSED/);
  });
});
