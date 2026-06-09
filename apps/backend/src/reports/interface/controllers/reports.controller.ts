import {
  DEFAULT_REPORT_LIST_LIMIT,
  type ReportDetailResponse,
  type ReportListResponse,
} from '@convene/shared-interfaces';
import {
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ReportNotFoundError,
  ReportNotResummarizableError,
} from '@/reports/application/report.errors';
import { ReportFinalizationService } from '@/reports/application/report-finalization.service';
import { ListReportsQueryDto } from '@/reports/interface/dto/list-reports-query.dto';
import { AdminGuard } from '@/reports/interface/guards/admin.guard';

import {
  toReportDetailResponse,
  toReportListItem,
} from './report-serialize';

/**
 * 책임: query/path 검증, 서비스 호출, wire format 직렬화, 도메인 에러 → HTTP 매핑.
 * 비즈니스 로직은 일체 두지 않는다.
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

  /**
   * 관리자 재요약. 저장된 transcript+chat 으로 다시 요약해 기존 summary 를 교체한다.
   * `AdminGuard` 가 `Authorization: Bearer <ADMIN_API_TOKEN>` 로 호출자를 가른다.
   */
  @Post(':id/resummarize')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async resummarize(@Param('id') id: string): Promise<ReportDetailResponse> {
    try {
      const report = await this.service.resummarize(id);
      return toReportDetailResponse(report);
    } catch (e) {
      if (e instanceof ReportNotFoundError) {
        throw new NotFoundException(e.message);
      }
      if (e instanceof ReportNotResummarizableError) {
        throw new ConflictException(e.message);
      }
      throw e;
    }
  }
}
