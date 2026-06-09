export class ReportNotFoundError extends Error {
  constructor(public readonly reportId: string) {
    super(`Report "${reportId}" not found`);
    this.name = 'ReportNotFoundError';
  }
}

export class ReportNotResummarizableError extends Error {
  constructor(
    public readonly reportId: string,
    public readonly reason: string,
  ) {
    super(`Report "${reportId}" cannot be resummarized: ${reason}`);
    this.name = 'ReportNotResummarizableError';
  }
}
