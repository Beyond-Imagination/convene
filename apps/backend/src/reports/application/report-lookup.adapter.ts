import { ReportRepository } from '@/reports/domain/ports';
import { FinalizedReport, ReportLookupPort } from '@/shared-kernel/domain/ports';

export class ReportLookupAdapter implements ReportLookupPort {
  constructor(private readonly repository: ReportRepository) {}

  async findFinalizedReport(_reportId: string): Promise<FinalizedReport | null> {
    throw new Error('not implemented');
  }
}
