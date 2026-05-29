import { NoopTranscriber } from './noop.transcriber';

describe('NoopTranscriber', () => {
  it('빈 transcript를 돌려준다 (audio 입력 내용과 무관)', async () => {
    const transcriber = new NoopTranscriber();
    // TranscriberInput.audio 계약은 항상 Buffer — 빈 버퍼/내용 있는 버퍼 모두 [] 반환.
    expect(
      await transcriber.transcribe({ meetingCode: 'abc12xyz', audio: Buffer.alloc(0) }),
    ).toEqual([]);
    expect(
      await transcriber.transcribe({ meetingCode: 'abc12xyz', audio: Buffer.from('x') }),
    ).toEqual([]);
  });

  it('throw하지 않는다 (RecordingService 가 failed 분기로 빠지지 않도록)', async () => {
    const transcriber = new NoopTranscriber();
    await expect(
      transcriber.transcribe({ meetingCode: 'abc12xyz', audio: Buffer.alloc(0) }),
    ).resolves.toEqual([]);
  });
});
