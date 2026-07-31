// 노션 이슈 DB의 속성명·트리거 옵션값. 실 보드 스키마가 바뀌면 이 파일만 고친다.
export const NOTION_ISSUE_PROPERTIES = {
  type: '유형', // 멀티셀렉트. MEETING_TRIGGER_OPTION 포함 시 회의 생성 대상
  status: '상태', // status 타입(select 아님 — 필터 문법이 다르다)
  meetingDate: '날짜', // date(시간 선택). 미설정이면 즉시 대상, 과거면 대상 아님
  meetingLink: '회의링크', // url. 비어 있어야 대상(멱등)
} as const;

export const MEETING_TRIGGER_OPTION = '회의';

/** 아직 열리지 않은 회의만 대상으로 삼는 상태값. 진행 중·완료 이슈는 회의가 이미 지났다고 본다. */
export const MEETING_PENDING_STATUS = '시작 전';
