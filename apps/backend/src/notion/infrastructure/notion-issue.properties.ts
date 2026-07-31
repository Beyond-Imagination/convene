// 노션 이슈 DB의 속성명·트리거 옵션값. 실 보드 스키마가 바뀌면 이 파일만 고친다.
export const NOTION_ISSUE_PROPERTIES = {
  type: '유형',
  status: '상태',
  meetingDate: '날짜',
  meetingLink: '회의링크',
} as const;

export const MEETING_TRIGGER_OPTION = '회의';

/** 아직 열리지 않은 회의만 대상으로 삼는 상태값. 진행 중·완료 이슈는 회의가 이미 지났다고 본다. */
export const MEETING_PENDING_STATUS = '시작 전';
