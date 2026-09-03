import {
  MAX_REPORT_PAGE_SIZE,
  REPORT_SORT_OPTIONS,
  ReportSortOption,
} from '@convene/shared-interfaces';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * GET /reports 쿼리스트링 DTO.
 *
 * 미지정 값은 컨트롤러가 기본값(1페이지 / `DEFAULT_REPORT_PAGE_SIZE` / `DEFAULT_REPORT_SORT`)으로 채운다.
 */
export class ListReportsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_REPORT_PAGE_SIZE)
  size?: number;

  @IsOptional()
  @IsIn([...REPORT_SORT_OPTIONS])
  sort?: ReportSortOption;
}
