import { ValidationPipe } from '@nestjs/common';

import { ChatDto } from './chat.dto';

const makePipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new Error(JSON.stringify(errors)),
  });

const run = (body: unknown) => makePipe().transform(body, { type: 'body', metatype: ChatDto });

describe('ChatDto + ValidationPipe', () => {
  it('정상 payload는 ChatDto 인스턴스로 변환된다', async () => {
    const dto = (await run({ code: 'abc12xyz', text: 'hello' })) as ChatDto;
    expect(dto).toBeInstanceOf(ChatDto);
    expect(dto.code).toBe('abc12xyz');
    expect(dto.text).toBe('hello');
  });

  it('code가 8자가 아니면 거부', async () => {
    await expect(run({ code: 'short', text: 'hello' })).rejects.toThrow(/code/i);
  });

  it('text 누락은 거부', async () => {
    await expect(run({ code: 'abc12xyz' })).rejects.toThrow(/text/i);
  });

  it('빈 text는 거부', async () => {
    await expect(run({ code: 'abc12xyz', text: '' })).rejects.toThrow(/text/i);
  });

  it('text 최대 길이(1000) 초과 거부', async () => {
    await expect(run({ code: 'abc12xyz', text: 'a'.repeat(1001) })).rejects.toThrow(/text/i);
  });

  it('whitelist 위반(허용되지 않은 키)은 거부', async () => {
    await expect(run({ code: 'abc12xyz', text: 'hi', evil: 1 })).rejects.toThrow(/evil/);
  });
});
