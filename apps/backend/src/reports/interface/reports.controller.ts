import {
  DEFAULT_REPORT_PAGE_SIZE,
  DEFAULT_REPORT_SORT,
  type ReportDetailResponse,
  type ReportListResponse,
} from '@convene/shared-interfaces';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ReportFinalizationService } from '@/reports/application/report-finalization.service';
import { reportListCriteria } from '@/reports/domain/value-objects/report-list-query';
import { AdminGuard } from '@/reports/interface/admin.guard';
import { ListReportsQueryDto } from '@/reports/interface/list-reports-query.dto';

import { toReportDetailResponse, toReportListResponse } from './report-serialize';

/**
 * 책임: query/path 검증, 서비스 호출, wire format 직렬화.
 * 도메인 에러(ReportNotFound/ReportNotResummarizable) → HTTP 매핑은 DomainExceptionFilter가 담당.
 */
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportFinalizationService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listReports(@Query() query: ListReportsQueryDto): Promise<ReportListResponse> {
    const criteria = reportListCriteria({
      page: query.page ?? 1,
      size: query.size ?? DEFAULT_REPORT_PAGE_SIZE,
      sort: query.sort ?? DEFAULT_REPORT_SORT,
    });
    return toReportListResponse(await this.service.listPage(criteria), criteria);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getReport(@Param('id') id: string): Promise<ReportDetailResponse> {
    const report = await this.service.getById(id);
    return toReportDetailResponse(report);
  }

  /**
   * 관리자 재요약. 저장된 transcript+chat으로 다시 요약해 기존 summary를 교체한다.
   * `AdminGuard`가 `Authorization: Bearer <ADMIN_API_TOKEN>`로 호출자를 가른다.
   */
  @Post(':id/resummarize')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async resummarize(@Param('id') id: string): Promise<ReportDetailResponse> {
    const report = await this.service.resummarize(id);
    return toReportDetailResponse(report);
  }
}
