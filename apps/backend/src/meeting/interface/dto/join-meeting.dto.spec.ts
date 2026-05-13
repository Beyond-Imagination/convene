import { ValidationPipe } from '@nestjs/common';

import { JoinMeetingDto } from './join-meeting.dto';

const makePipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new Error(JSON.stringify(errors)),
  });

const run = (body: unknown) =>
  makePipe().transform(body, { type: 'body', metatype: JoinMeetingDto });

describe('JoinMeetingDto + ValidationPipe', () => {
  it('정상 payload는 JoinMeetingDto 인스턴스로 변환된다', async () => {
    const dto = (await run({ code: 'abc12xyz', nickname: 'alice' })) as JoinMeetingDto;
    expect(dto).toBeInstanceOf(JoinMeetingDto);
    expect(dto.code).toBe('abc12xyz');
    expect(dto.nickname).toBe('alice');
  });

  it('code가 8자가 아니면 거부', async () => {
    await expect(run({ code: 'short', nickname: 'alice' })).rejects.toThrow(/code/i);
  });

  it('nickname 누락은 거부', async () => {
    await expect(run({ code: 'abc12xyz' })).rejects.toThrow(/nickname/i);
  });

  it('nickname 최대 길이(40) 초과 거부', async () => {
    await expect(run({ code: 'abc12xyz', nickname: 'a'.repeat(41) })).rejects.toThrow(/nickname/i);
  });

  it('whitelist 위반(허용되지 않은 키)은 거부', async () => {
    await expect(run({ code: 'abc12xyz', nickname: 'alice', evil: 1 })).rejects.toThrow(/evil/);
  });
});
