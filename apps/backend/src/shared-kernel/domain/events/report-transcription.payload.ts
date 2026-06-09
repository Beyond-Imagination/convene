export interface ReportTranscriptionRequestedPayload {
  readonly reportId: string;
  readonly meetingId: string;
  readonly code: string;
  readonly meetingStartedAtMs: number;
  readonly participantNames?: Readonly<Record<string, string>>;
}

export interface TranscriptionSegmentPayload {
  readonly speaker?: string;
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}

export interface ReportTranscriptionCompletedPayload {
  readonly reportId: string;
  readonly transcript: ReadonlyArray<TranscriptionSegmentPayload>;
}

export interface ReportTranscriptionFailedPayload {
  readonly reportId: string;
  readonly error: string;
}
