import {
  DEFAULT_REPORT_LIST_LIMIT,
  type ReportDetailResponse,
  type ReportListResponse,
} from '@convene/shared-interfaces';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';

import { ReportNotFoundError } from '@/reports/application/report.errors';
import { ReportFinalizationService } from '@/reports/application/report-finalization.service';
import { ListReportsQueryDto } from '@/reports/interface/dto/list-reports-query.dto';

import {
  toReportDetailResponse,
  toReportListItem,
} from './report-serialize';

/**
 * Reports bounded context의 HTTP Interface layer.
 *
 * 책임: query/path 검증, 서비스 호출, wire format 직렬화, 도메인 에러 → HTTP 매핑.
 * 비즈니스 로직은 일체 두지 않는다(ARCHITECTURE.md §3).
 */
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportFinalizationService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async listReports(@Query() query: ListReportsQueryDto): Promise<ReportListResponse> {
    const limit = query.limit ?? DEFAULT_REPORT_LIST_LIMIT;
    const reports = await this.service.listRecent(limit);
    return { items: reports.map(toReportListItem) };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getReport(@Param('id') id: string): Promise<ReportDetailResponse> {
    try {
      const report = await this.service.getById(id);
      return toReportDetailResponse(report);
    } catch (e) {
      if (e instanceof ReportNotFoundError) {
        throw new NotFoundException(e.message);
      }
      throw e;
    }
  }
}
