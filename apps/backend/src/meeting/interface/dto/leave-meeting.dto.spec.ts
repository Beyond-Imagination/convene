import { ValidationPipe } from '@nestjs/common';

import { LeaveMeetingDto } from './leave-meeting.dto';

const makePipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new Error(JSON.stringify(errors)),
  });

const run = (body: unknown) =>
  makePipe().transform(body, { type: 'body', metatype: LeaveMeetingDto });

describe('LeaveMeetingDto + ValidationPipe', () => {
  it('정상 payload는 LeaveMeetingDto 인스턴스로 변환된다', async () => {
    const dto = (await run({ code: 'abc12xyz' })) as LeaveMeetingDto;
    expect(dto).toBeInstanceOf(LeaveMeetingDto);
    expect(dto.code).toBe('abc12xyz');
  });

  it('code가 8자가 아니면 거부', async () => {
    await expect(run({ code: 'short' })).rejects.toThrow(/code/i);
  });

  it('code 누락은 거부', async () => {
    await expect(run({})).rejects.toThrow(/code/i);
  });

  it('whitelist 위반(허용되지 않은 키)은 거부', async () => {
    await expect(run({ code: 'abc12xyz', evil: 1 })).rejects.toThrow(/evil/);
  });
});
