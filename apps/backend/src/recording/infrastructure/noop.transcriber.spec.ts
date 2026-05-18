import { NoopTranscriber } from './noop.transcriber';

describe('NoopTranscriber', () => {
  it('빈 transcript를 돌려준다 (audio 입력과 무관)', async () => {
    const transcriber = new NoopTranscriber();
    expect(
      await transcriber.transcribe({ meetingCode: 'abc12xyz', audio: null }),
    ).toEqual([]);
    expect(
      await transcriber.transcribe({ meetingCode: 'abc12xyz', audio: Buffer.from('x') }),
    ).toEqual([]);
  });

  it('throw하지 않는다 (RecordingService 가 failed 분기로 빠지지 않도록)', async () => {
    const transcriber = new NoopTranscriber();
    await expect(
      transcriber.transcribe({ meetingCode: 'abc12xyz', audio: null }),
    ).resolves.toEqual([]);
  });
});
