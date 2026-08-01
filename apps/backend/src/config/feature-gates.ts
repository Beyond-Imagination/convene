export interface FeatureGates {
  readonly notionReportPush: boolean;
  readonly notionPolling: boolean;
  readonly notionButton: boolean;
  readonly summarizer: boolean;
  readonly adminApi: boolean;
}

export function resolveFeatureGates(_env: NodeJS.ProcessEnv = process.env): FeatureGates {
  throw new Error('not implemented');
}
