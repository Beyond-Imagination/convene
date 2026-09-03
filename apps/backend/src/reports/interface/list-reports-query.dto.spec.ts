import { MAX_REPORT_PAGE_SIZE } from '@convene/shared-interfaces';
import { ValidationPipe } from '@nestjs/common';

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
  it('빈 query는 모든 필드가 undefined인 DTO 인스턴스로 통과한다', async () => {
    const dto = (await run({})) as ListReportsQueryDto;
    expect(dto).toBeInstanceOf(ListReportsQueryDto);
    expect(dto.page).toBeUndefined();
    expect(dto.size).toBeUndefined();
    expect(dto.sort).toBeUndefined();
  });

  it('page/size가 string 숫자면 number로 캐스팅한다', async () => {
    const dto = (await run({ page: '3', size: '15' })) as ListReportsQueryDto;
    expect(dto.page).toBe(3);
    expect(dto.size).toBe(15);
  });

  it(`size가 ${MAX_REPORT_PAGE_SIZE}보다 크면 거부한다`, async () => {
    await expect(run({ size: String(MAX_REPORT_PAGE_SIZE + 1) })).rejects.toThrow(/size/i);
  });

  it('page/size가 1 미만이면 거부한다', async () => {
    await expect(run({ page: '0' })).rejects.toThrow(/page/i);
    await expect(run({ size: '0' })).rejects.toThrow(/size/i);
    await expect(run({ page: '-2' })).rejects.toThrow(/page/i);
  });

  it('page/size가 정수가 아니면 거부한다', async () => {
    await expect(run({ page: '3.14' })).rejects.toThrow(/page/i);
    await expect(run({ size: 'abc' })).rejects.toThrow(/size/i);
  });

  it('sort는 정의된 프리셋만 통과한다', async () => {
    const dto = (await run({ sort: 'latest' })) as ListReportsQueryDto;
    expect(dto.sort).toBe('latest');
    await expect(run({ sort: 'oldest' })).rejects.toThrow(/sort/i);
  });

  it('whitelist 위반(허용되지 않은 키)은 거부한다', async () => {
    await expect(run({ page: '1', evil: '1' })).rejects.toThrow(/evil/);
  });
});
