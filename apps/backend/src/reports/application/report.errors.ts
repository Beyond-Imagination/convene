import { ConflictError, NotFoundError } from '@/shared-kernel/domain/errors';

export class ReportNotFoundError extends NotFoundError {
  constructor(public readonly reportId: string) {
    super(`Report "${reportId}" not found`);
  }
}

export class ReportNotResummarizableError extends ConflictError {
  constructor(
    public readonly reportId: string,
    public readonly reason: string,
  ) {
    super(`Report "${reportId}" cannot be resummarized: ${reason}`);
  }
}
