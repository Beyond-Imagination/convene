import { MeetingCode } from '@/meeting/domain/value-objects/meeting-code';

import { RandomMeetingCodeGenerator } from './random-meeting-code.generator';

describe('RandomMeetingCodeGenerator', () => {
  it('next()는 8자 [a-z0-9] 포맷의 MeetingCode 인스턴스를 반환한다', () => {
    const generator = new RandomMeetingCodeGenerator();
    const code = generator.next();
    expect(code).toBeInstanceOf(MeetingCode);
    expect(code.value).toMatch(/^[a-z0-9]{8}$/);
  });

  it('여러 번 호출해도 모두 MeetingCode 형식을 통과한다 (100회 sanity)', () => {
    const generator = new RandomMeetingCodeGenerator();
    for (let i = 0; i < 100; i++) {
      const code = generator.next();
      expect(code.value).toMatch(/^[a-z0-9]{8}$/);
    }
  });

  it('100회 호출 시 충돌이 거의 없다 (uniqueness sanity, ≥95 / 100)', () => {
    const generator = new RandomMeetingCodeGenerator();
    const values = new Set<string>();
    for (let i = 0; i < 100; i++) values.add(generator.next().value);
    expect(values.size).toBeGreaterThanOrEqual(95);
  });
});
