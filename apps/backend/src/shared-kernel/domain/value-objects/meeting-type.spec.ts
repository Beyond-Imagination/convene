import { asMeetingType, DEFAULT_MEETING_TYPE, MEETING_TYPES } from './meeting-type';

describe('MeetingType', () => {
  it('general/retrospective/weekly-sync 세 가지를 포함한다', () => {
    expect(MEETING_TYPES).toEqual(['general', 'retrospective', 'weekly-sync']);
  });

  it('기본값은 general이다', () => {
    expect(DEFAULT_MEETING_TYPE).toBe('general');
  });

  it.each(MEETING_TYPES)('asMeetingType은 알려진 값을 허용한다: "%s"', (t) => {
    expect(asMeetingType(t)).toBe(t);
  });

  it.each(['', 'GENERAL', 'retro', 'weekly', 'weekly_sync'])(
    'asMeetingType은 알려지지 않은 값을 거부한다: "%s"',
    (raw) => {
      expect(() => asMeetingType(raw)).toThrow(/MeetingType/);
    },
  );
});
