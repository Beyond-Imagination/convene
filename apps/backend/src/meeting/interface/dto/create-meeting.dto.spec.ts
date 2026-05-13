import { ValidationPipe } from '@nestjs/common';

import { CreateMeetingDto } from './create-meeting.dto';
import { ExternalReferenceDto } from './external-reference.dto';

const makePipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    // 에러 상세를 message에 담아 어떤 필드가 거부됐는지 단위 spec에서 확인 가능하게 한다.
    exceptionFactory: (errors) => new Error(JSON.stringify(errors)),
  });

const run = (body: unknown) =>
  makePipe().transform(body, { type: 'body', metatype: CreateMeetingDto });

describe('CreateMeetingDto + ValidationPipe', () => {
  it('source="web"만 있는 페이로드는 통과해 CreateMeetingDto 인스턴스로 변환된다', async () => {
    const dto = (await run({ source: 'web' })) as CreateMeetingDto;
    expect(dto).toBeInstanceOf(CreateMeetingDto);
    expect(dto.source).toBe('web');
    expect(dto.externalReference).toBeUndefined();
  });

  it('source="notion-issue" + externalReference.issueId 정상 페이로드는 통과한다', async () => {
    const dto = (await run({
      source: 'notion-issue',
      externalReference: { issueId: 'NTN-1' },
    })) as CreateMeetingDto;
    expect(dto.source).toBe('notion-issue');
    expect(dto.externalReference).toBeInstanceOf(ExternalReferenceDto);
    expect(dto.externalReference?.issueId).toBe('NTN-1');
  });

  it('잘못된 source 값은 거부한다', async () => {
    await expect(run({ source: 'invalid' })).rejects.toThrow(/source/i);
  });

  it('source 누락은 거부한다', async () => {
    await expect(run({})).rejects.toThrow(/source/i);
  });

  it('whitelist 위반(허용되지 않은 키)은 거부한다', async () => {
    await expect(run({ source: 'web', evil: 1 })).rejects.toThrow(/evil/);
  });

  it('externalReference.issueId가 빈 문자열이면 거부한다', async () => {
    await expect(
      run({ source: 'notion-issue', externalReference: { issueId: '' } }),
    ).rejects.toThrow(/issueId/i);
  });
});
