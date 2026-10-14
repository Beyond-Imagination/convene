/**
 * 버그 리포트 wire format. 프론트 폼과 백엔드 DTO·노션 본문이 같은 값을 쓴다.
 *
 * 이미지는 먼저 `POST /bug-reports/images` 로 한 장씩 올려 uploadId 를 받고,
 * 본문 `POST /bug-reports` 에 그 id 들을 싣는다.
 */

export const BUG_REPORT_LOCATIONS = ['home', 'meeting', 'reports', 'notion-card', 'other'] as const;
export type BugReportLocation = (typeof BUG_REPORT_LOCATIONS)[number];

export const BUG_REPORT_LOCATION_LABELS: Readonly<Record<BugReportLocation, string>> = {
  home: '홈 화면 (회의 만들기 / 입장)',
  meeting: '회의 화면',
  reports: '회의록',
  'notion-card': '노션 이슈에 삽입된 회의 카드',
  other: '그 외',
};

export const BUG_REPORT_LIMITS = {
  summaryMax: 300,
  /** 노션 rich text 한 덩어리 상한(2000자)에 맞춘다. */
  textMax: 2000,
  shortTextMax: 200,
  stepsMax: 10,
  imagesMax: 5,
  /** 무료 워크스페이스의 노션 파일 업로드 상한. */
  imageBytesMax: 5 * 1024 * 1024,
  imageTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
} as const;

export interface BugReportRequest {
  /** 무슨 일이 있었나요 — 이슈 제목에도 쓴다. */
  readonly summary: string;
  readonly locations: ReadonlyArray<BugReportLocation>;
  /** locations 에 'other' 가 있을 때의 설명. */
  readonly otherLocation?: string;
  readonly meetingCode?: string;
  /** 발생 시각. 사용자가 입력한 그대로(대략적인 시각). */
  readonly occurredAt?: string;
  readonly steps: ReadonlyArray<string>;
  readonly expected?: string;
  readonly device?: string;
  readonly browser?: string;
  readonly network?: string;
  readonly notes?: string;
  readonly imageUploadIds: ReadonlyArray<string>;
}

export interface BugReportImageUploadResponse {
  readonly uploadId: string;
}
