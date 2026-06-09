import type { Source } from './meeting.js';

/*
 * Reports의 HTTP wire format.
 *
 * 본 파일은 frontend ↔ backend가 공유하는 **순수 TS 인터페이스 / literal 타입**만 정의한다.
 *
 * 직렬화 규약:
 *   - 모든 `Date` 값은 ISO 8601 문자열로 직렬화한다.
 *   - 누락 가능 필드(`null` 허용)는 backend 도메인 모델의 `null`을 그대로 반영한다.
 */

export const REPORT_PIPELINE_STATUSES = ['pending', 'done', 'failed'] as const;
export type ReportPipelineStatus = (typeof REPORT_PIPELINE_STATUSES)[number];

export const REPORT_PIPELINE_STAGES = ['stt', 'summary'] as const;
export type ReportPipelineStage = (typeof REPORT_PIPELINE_STAGES)[number];

export interface ReportPipelineFailureWire {
  stage: ReportPipelineStage;
  error: string;
  at: string;
}

export interface ReportPipelineWire {
  sttStatus: ReportPipelineStatus;
  summaryStatus: ReportPipelineStatus;
  failures: ReportPipelineFailureWire[];
}

export interface ReportParticipantWire {
  id: string;
  nickname: string;
  joinedAt: string;
  leftAt: string | null;
}

export interface ReportChatWire {
  nickname: string;
  text: string;
  sentAt: string;
}

export interface ReportTranscriptWire {
  speaker?: string;
  text: string;
  startMs: number;
  endMs: number;
}

export interface ReportActionItemWire {
  owner?: string;
  task: string;
  due?: string;
}

export interface ReportKeyTopicWire {
  topic: string;
  points: string[];
}

export interface ReportSummaryWire {
  title: string;
  overview: string;
  decisions: string[];
  actionItems: ReportActionItemWire[];
  keyTopics: ReportKeyTopicWire[];
}

export interface ReportNotionPushWire {
  pageId: string;
  at: string;
}

/**
 * GET /reports 목록 응답의 한 항목.
 *
 * 카드/리스트 뷰에서 필요한 핵심 정보만 평면화한다. 상세 본문은 GET /reports/:id로 가져온다.
 */
export interface ReportListItem {
  id: string;
  code: string;
  source: Source;
  startedAt: string;
  endedAt: string;
  participantCount: number;
  pipeline: Pick<ReportPipelineWire, 'sttStatus' | 'summaryStatus'>;
  title: string | null;
}

export interface ReportListResponse {
  items: ReportListItem[];
}

/**
 * GET /reports/:id 상세 응답.
 *
 * 도메인 Aggregate `MeetingReport`의 wire format 1:1 직렬화.
 */
export interface ReportDetailResponse {
  id: string;
  meetingId: string;
  code: string;
  source: Source;
  title: string | null;
  externalReference: { issueId?: string };
  startedAt: string;
  endedAt: string;
  participants: ReportParticipantWire[];
  chat: ReportChatWire[];
  transcript: ReportTranscriptWire[];
  summary: ReportSummaryWire | null;
  pipeline: ReportPipelineWire;
  pushedToNotion: ReportNotionPushWire | null;
}

export const DEFAULT_REPORT_LIST_LIMIT = 20;
export const MAX_REPORT_LIST_LIMIT = 100;
