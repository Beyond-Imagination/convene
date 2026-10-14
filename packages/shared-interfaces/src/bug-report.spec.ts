import { describe, expect, it } from 'vitest';

import {
  BUG_REPORT_LIMITS,
  BUG_REPORT_LOCATION_LABELS,
  BUG_REPORT_LOCATIONS,
  type BugReportRequest,
} from './bug-report.js';

describe('Bug report wire format', () => {
  it('발생 위치마다 사람이 읽는 이름이 있다', () => {
    for (const location of BUG_REPORT_LOCATIONS) {
      expect(BUG_REPORT_LOCATION_LABELS[location].length).toBeGreaterThan(0);
    }
  });

  it('이미지 상한은 노션 무료 업로드 상한(5MB) 이하다', () => {
    expect(BUG_REPORT_LIMITS.imageBytesMax).toBeLessThanOrEqual(5 * 1024 * 1024);
    expect(BUG_REPORT_LIMITS.imageTypes).toContain('image/png');
  });

  it('필수 항목만으로 요청을 만들 수 있다', () => {
    const request: BugReportRequest = {
      summary: '소리가 안 들려요',
      locations: ['meeting'],
      steps: [],
      imageUploadIds: [],
    };
    expect(request.locations).toEqual(['meeting']);
  });
});
