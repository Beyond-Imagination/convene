import { ValidationPipe } from '@nestjs/common';

import { ChatDto, CreateMeetingDto, ExternalReferenceDto, JoinMeetingDto, LeaveMeetingDto } from './meeting.dto';

const makePipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    // 에러 상세를 message에 담아 어떤 필드가 거부됐는지 단위 spec에서 확인 가능하게 한다.
    exceptionFactory: (errors) => new Error(JSON.stringify(errors)),
  });

const run = <T>(metatype: unknown, body: unknown): Promise<T> =>
  makePipe().transform(body, { type: 'body', metatype: metatype as never }) as Promise<T>;

describe('CreateMeetingDto + ValidationPipe', () => {
  it('source="web"만 있는 페이로드는 통과해 CreateMeetingDto 인스턴스로 변환된다', async () => {
    const dto = await run<CreateMeetingDto>(CreateMeetingDto, { source: 'web' });
    expect(dto).toBeInstanceOf(CreateMeetingDto);
    expect(dto.source).toBe('web');
    expect(dto.externalReference).toBeUndefined();
  });

  it('source="notion-issue" + externalReference.issueId 정상 페이로드는 통과한다', async () => {
    const dto = await run<CreateMeetingDto>(CreateMeetingDto, {
      source: 'notion-issue',
      externalReference: { issueId: 'NTN-1' },
    });
    expect(dto.source).toBe('notion-issue');
    expect(dto.externalReference).toBeInstanceOf(ExternalReferenceDto);
    expect(dto.externalReference?.issueId).toBe('NTN-1');
  });

  it('잘못된 source 값은 거부한다', async () => {
    await expect(run(CreateMeetingDto, { source: 'invalid' })).rejects.toThrow(/source/i);
  });

  it('source 누락은 거부한다', async () => {
    await expect(run(CreateMeetingDto, {})).rejects.toThrow(/source/i);
  });

  it('whitelist 위반(허용되지 않은 키)은 거부한다', async () => {
    await expect(run(CreateMeetingDto, { source: 'web', evil: 1 })).rejects.toThrow(/evil/);
  });

  it('externalReference.issueId가 빈 문자열이면 거부한다', async () => {
    await expect(
      run(CreateMeetingDto, { source: 'notion-issue', externalReference: { issueId: '' } }),
    ).rejects.toThrow(/issueId/i);
  });
});

describe('JoinMeetingDto + ValidationPipe', () => {
  it('정상 payload는 JoinMeetingDto 인스턴스로 변환된다', async () => {
    const dto = await run<JoinMeetingDto>(JoinMeetingDto, { code: 'abc12xyz', nickname: 'alice' });
    expect(dto).toBeInstanceOf(JoinMeetingDto);
    expect(dto.code).toBe('abc12xyz');
    expect(dto.nickname).toBe('alice');
  });

  it('code가 8자가 아니면 거부', async () => {
    await expect(run(JoinMeetingDto, { code: 'short', nickname: 'alice' })).rejects.toThrow(/code/i);
  });

  it('nickname 누락은 거부', async () => {
    await expect(run(JoinMeetingDto, { code: 'abc12xyz' })).rejects.toThrow(/nickname/i);
  });

  it('nickname 최대 길이(40) 초과 거부', async () => {
    await expect(
      run(JoinMeetingDto, { code: 'abc12xyz', nickname: 'a'.repeat(41) }),
    ).rejects.toThrow(/nickname/i);
  });

  it('whitelist 위반(허용되지 않은 키)은 거부', async () => {
    await expect(
      run(JoinMeetingDto, { code: 'abc12xyz', nickname: 'alice', evil: 1 }),
    ).rejects.toThrow(/evil/);
  });
});

describe('LeaveMeetingDto + ValidationPipe', () => {
  it('정상 payload는 LeaveMeetingDto 인스턴스로 변환된다', async () => {
    const dto = await run<LeaveMeetingDto>(LeaveMeetingDto, { code: 'abc12xyz' });
    expect(dto).toBeInstanceOf(LeaveMeetingDto);
    expect(dto.code).toBe('abc12xyz');
  });

  it('code가 8자가 아니면 거부', async () => {
    await expect(run(LeaveMeetingDto, { code: 'short' })).rejects.toThrow(/code/i);
  });

  it('code 누락은 거부', async () => {
    await expect(run(LeaveMeetingDto, {})).rejects.toThrow(/code/i);
  });

  it('whitelist 위반(허용되지 않은 키)은 거부', async () => {
    await expect(run(LeaveMeetingDto, { code: 'abc12xyz', evil: 1 })).rejects.toThrow(/evil/);
  });
});

describe('ChatDto + ValidationPipe', () => {
  it('정상 payload는 ChatDto 인스턴스로 변환된다', async () => {
    const dto = await run<ChatDto>(ChatDto, { code: 'abc12xyz', text: 'hello' });
    expect(dto).toBeInstanceOf(ChatDto);
    expect(dto.code).toBe('abc12xyz');
    expect(dto.text).toBe('hello');
  });

  it('code가 8자가 아니면 거부', async () => {
    await expect(run(ChatDto, { code: 'short', text: 'hello' })).rejects.toThrow(/code/i);
  });

  it('text 누락은 거부', async () => {
    await expect(run(ChatDto, { code: 'abc12xyz' })).rejects.toThrow(/text/i);
  });

  it('빈 text는 거부', async () => {
    await expect(run(ChatDto, { code: 'abc12xyz', text: '' })).rejects.toThrow(/text/i);
  });

  it('text 최대 길이(1000) 초과 거부', async () => {
    await expect(run(ChatDto, { code: 'abc12xyz', text: 'a'.repeat(1001) })).rejects.toThrow(
      /text/i,
    );
  });

  it('whitelist 위반(허용되지 않은 키)은 거부', async () => {
    await expect(run(ChatDto, { code: 'abc12xyz', text: 'hi', evil: 1 })).rejects.toThrow(/evil/);
  });
});
