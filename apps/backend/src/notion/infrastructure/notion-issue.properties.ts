// 노션 이슈 DB의 속성명·트리거 옵션값. 실 보드 스키마가 바뀌면 이 파일만 고친다.
export const NOTION_ISSUE_PROPERTIES = {
  type: '유형', // 멀티셀렉트. MEETING_TRIGGER_OPTION 포함 시 회의 생성 대상
  meetingDate: '날짜', // date. 미설정이면 즉시 대상
  meetingLink: '회의링크', // url. 비어 있어야 대상(멱등)
} as const;

export const MEETING_TRIGGER_OPTION = '회의';
