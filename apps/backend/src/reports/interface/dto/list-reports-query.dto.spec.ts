import { ValidationPipe } from '@nestjs/common';

import { MAX_REPORT_LIST_LIMIT } from '@migration/shared-interfaces';

import { ListReportsQueryDto } from './list-reports-query.dto';

const makePipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new Error(JSON.stringify(errors)),
  });

const run = (query: unknown) =>
  makePipe().transform(query, { type: 'query', metatype: ListReportsQueryDto });

describe('ListReportsQueryDto + ValidationPipe', () => {
  it('빈 query는 limit이 undefined인 DTO 인스턴스로 통과한다', async () => {
    const dto = (await run({})) as ListReportsQueryDto;
    expect(dto).toBeInstanceOf(ListReportsQueryDto);
    expect(dto.limit).toBeUndefined();
  });

  it('limit이 string 숫자면 number로 캐스팅한다', async () => {
    const dto = (await run({ limit: '15' })) as ListReportsQueryDto;
    expect(dto.limit).toBe(15);
  });

  it(`limit이 ${MAX_REPORT_LIST_LIMIT}보다 크면 거부한다`, async () => {
    await expect(run({ limit: String(MAX_REPORT_LIST_LIMIT + 1) })).rejects.toThrow(/limit/i);
  });

  it('limit이 0 이하면 거부한다', async () => {
    await expect(run({ limit: '0' })).rejects.toThrow(/limit/i);
    await expect(run({ limit: '-5' })).rejects.toThrow(/limit/i);
  });

  it('limit이 정수가 아니면 거부한다', async () => {
    await expect(run({ limit: '3.14' })).rejects.toThrow(/limit/i);
  });

  it('whitelist 위반(허용되지 않은 키)은 거부한다', async () => {
    await expect(run({ limit: '5', evil: '1' })).rejects.toThrow(/evil/);
  });
});
