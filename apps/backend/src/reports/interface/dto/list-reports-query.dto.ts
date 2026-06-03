import { MAX_REPORT_LIST_LIMIT } from '@convene/shared-interfaces';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * GET /reports 쿼리스트링 DTO.
 *
 * `limit` 미지정 시 컨트롤러가 `DEFAULT_REPORT_LIST_LIMIT` 을 적용한다.
 * `@Type(() => Number)` 가 query string("10") 을 number 로 캐스팅한 뒤 검증한다.
 */
export class ListReportsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_REPORT_LIST_LIMIT)
  limit?: number;
}
