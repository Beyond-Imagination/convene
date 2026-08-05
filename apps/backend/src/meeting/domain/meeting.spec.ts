import { IdleTimeout } from '@/meeting/domain/value-objects/idle-timeout';
import { MeetingCode } from '@/meeting/domain/value-objects/meeting-code';
import { externalReference } from '@/shared-kernel/domain/value-objects/external-reference';

import { Meeting } from './meeting';

describe('Meeting (Aggregate Root)', () => {
  const T_0 = new Date('2026-01-01T00:00:00Z');
  const T_30s = new Date('2026-01-01T00:00:30Z');
  const T_1m = new Date('2026-01-01T00:01:00Z');
  const T_10m_after_T_1m = new Date('2026-01-01T00:11:00Z');
  const T_1m_minus = new Date('2026-01-01T00:00:59Z');

  const newMeeting = (title: string | null = null) =>
    Meeting.create({
      code: MeetingCode.from('abc12xyz'),
      source: 'web',
      externalReference: externalReference(),
      idleTimeout: IdleTimeout.default(),
      startedAt: T_0,
      hostToken: 'host-token-1',
      title,
    });

  describe('create', () => {
    it('open 상태이고 참가자 0명, lastActiveAt = startedAt으로 생성된다', () => {
      const m = newMeeting();
      expect(m.isOpen).toBe(true);
      expect(m.endedAt).toBeNull();
      expect(m.activeParticipantCount).toBe(0);
      expect(m.lastActiveAt).toBe(T_0);
    });

    it('생성 시 받은 hostToken을 보유한다 (회의 종료 권한 식별용)', () => {
      const m = newMeeting();
      expect(m.hostToken).toBe('host-token-1');
    });

    it('생성 시 받은 title을 보유한다(없으면 null)', () => {
      expect(newMeeting().title).toBeNull();
      expect(newMeeting('주간 회의').title).toBe('주간 회의');
    });

    it('hostToken이 주어진 토큰과 일치하는지 isHost로 검증한다', () => {
      const m = newMeeting();
      expect(m.isHost('host-token-1')).toBe(true);
      expect(m.isHost('wrong-token')).toBe(false);
    });
  });

  describe('addParticipant', () => {
    it('정상 추가 시 Participant 반환, count 증가, lastActiveAt 갱신', () => {
      const m = newMeeting();
      const p = m.addParticipant('s1', 'alice', T_30s);
      expect(p.id).toBe('s1');
      expect(p.nickname).toBe('alice');
      expect(m.activeParticipantCount).toBe(1);
      expect(m.lastActiveAt).toBe(T_30s);
    });

    it('동일 id 중복 추가는 거부한다', () => {
      const m = newMeeting();
      m.addParticipant('s1', 'alice', T_30s);
      expect(() => m.addParticipant('s1', 'bob', T_1m)).toThrow(/already exists/);
    });

    it('close 후 추가는 거부한다', () => {
      const m = newMeeting();
      m.close(T_30s);
      expect(() => m.addParticipant('s1', 'alice', T_1m)).toThrow(/already closed/);
    });
  });

  describe('removeParticipant', () => {
    it('정상 제거 시 inactive, count 감소, lastActiveAt 갱신', () => {
      const m = newMeeting();
      m.addParticipant('s1', 'alice', T_30s);
      m.removeParticipant('s1', T_1m);
      expect(m.activeParticipantCount).toBe(0);
      expect(m.lastActiveAt).toBe(T_1m);
    });

    it('떠난 Participant entity를 반환한다(leftAt 채워짐)', () => {
      const m = newMeeting();
      m.addParticipant('s1', 'alice', T_30s);
      const removed = m.removeParticipant('s1', T_1m);
      expect(removed.id).toBe('s1');
      expect(removed.nickname).toBe('alice');
      expect(removed.leftAt).toBe(T_1m);
      expect(removed.isActive).toBe(false);
    });

    it('등록되지 않은 id 제거는 거부한다', () => {
      const m = newMeeting();
      expect(() => m.removeParticipant('s1', T_30s)).toThrow(/not found/);
    });

    it('이미 leave한 id를 다시 제거하면 거부한다', () => {
      const m = newMeeting();
      m.addParticipant('s1', 'alice', T_30s);
      m.removeParticipant('s1', T_1m);
      expect(() => m.removeParticipant('s1', T_1m)).toThrow(/already left/);
    });

    it('close 후 제거는 거부한다', () => {
      const m = newMeeting();
      m.addParticipant('s1', 'alice', T_30s);
      m.close(T_1m);
      expect(() => m.removeParticipant('s1', T_1m)).toThrow(/already closed/);
    });
  });

  describe('findParticipant', () => {
    it('등록된 id면 해당 Participant를 반환한다', () => {
      const m = newMeeting();
      m.addParticipant('s1', 'alice', T_30s);
      const found = m.findParticipant('s1');
      expect(found?.id).toBe('s1');
      expect(found?.nickname).toBe('alice');
    });

    it('없는 id면 undefined를 반환한다', () => {
      const m = newMeeting();
      expect(m.findParticipant('unknown')).toBeUndefined();
    });

    it('leave한 Participant도 반환한다(닉네임 조회용)', () => {
      const m = newMeeting();
      m.addParticipant('s1', 'alice', T_30s);
      m.removeParticipant('s1', T_1m);
      const found = m.findParticipant('s1');
      expect(found?.isActive).toBe(false);
      expect(found?.nickname).toBe('alice');
    });
  });

  describe('markActive', () => {
    it('lastActiveAt을 입력 시각으로 갱신한다', () => {
      const m = newMeeting();
      m.markActive(T_30s);
      expect(m.lastActiveAt).toBe(T_30s);
    });

    it('과거 시각이 들어오면 lastActiveAt을 뒤로 되돌리지 않는다(monotonic)', () => {
      const m = newMeeting();
      m.markActive(T_1m);
      m.markActive(T_30s);
      expect(m.lastActiveAt).toBe(T_1m);
    });

    it('close 후 markActive는 거부한다', () => {
      const m = newMeeting();
      m.close(T_30s);
      expect(() => m.markActive(T_1m)).toThrow(/already closed/);
    });
  });

  describe('isIdleSince', () => {
    it('활성 참가자가 있으면 항상 false (idle 카운터 0명일 때만 작동)', () => {
      const m = newMeeting();
      m.addParticipant('s1', 'alice', T_30s);
      const farFuture = new Date('2027-01-01T00:00:00Z');
      expect(m.isIdleSince(farFuture)).toBe(false);
    });

    it('참가자 0 + idleTimeout 미만 경과 → false', () => {
      const m = newMeeting();
      m.addParticipant('s1', 'alice', T_30s);
      m.removeParticipant('s1', T_1m); // lastActive = T_1m
      const t1m_59s = new Date('2026-01-01T00:01:59Z'); // 59초 경과(1분 미만)
      expect(m.isIdleSince(t1m_59s)).toBe(false);
    });

    it('참가자 0 + idleTimeout 이상 경과 → true', () => {
      const m = newMeeting();
      m.addParticipant('s1', 'alice', T_30s);
      m.removeParticipant('s1', T_1m); // lastActive = T_1m
      expect(m.isIdleSince(T_10m_after_T_1m)).toBe(true); // 10분 경과(1분 초과)
    });
  });

  describe('close', () => {
    it('정상 종료 시 endedAt 기록, isOpen=false', () => {
      const m = newMeeting();
      m.close(T_30s);
      expect(m.isOpen).toBe(false);
      expect(m.endedAt).toBe(T_30s);
    });

    it('활성 참가자가 있으면 모두 같은 시각으로 자동 leave 처리한다', () => {
      const m = newMeeting();
      m.addParticipant('s1', 'alice', T_30s);
      m.addParticipant('s2', 'bob', T_30s);
      m.close(T_1m);
      const snap = m.snapshot();
      expect(snap.participants).toHaveLength(2);
      expect(snap.participants.every((p) => p.leftAt?.getTime() === T_1m.getTime())).toBe(true);
      expect(m.activeParticipantCount).toBe(0);
    });

    it('중복 close는 거부한다', () => {
      const m = newMeeting();
      m.close(T_30s);
      expect(() => m.close(T_1m)).toThrow(/already closed/);
    });

    it('endedAt이 startedAt보다 이르면 거부한다', () => {
      const m = newMeeting();
      expect(() => m.close(T_1m_minus)).not.toThrow(); // 검증용: T_1m_minus(T+59s)는 startedAt(T_0)보다 뒤이므로 OK
      const earlier = new Date('2025-12-31T23:00:00Z');
      const m2 = newMeeting();
      expect(() => m2.close(earlier)).toThrow(/cannot be earlier/);
    });
  });

  describe('snapshot', () => {
    it('plain object로 전체 상태(참가자 포함)를 노출한다', () => {
      const m = newMeeting();
      m.addParticipant('s1', 'alice', T_30s);
      const snap = m.snapshot();
      expect(snap.code).toBe('abc12xyz');
      expect(snap.source).toBe('web');
      expect(snap.idleTimeoutMs).toBe(IdleTimeout.DEFAULT_MS);
      expect(snap.startedAt).toBe(T_0);
      expect(snap.endedAt).toBeNull();
      expect(snap.lastActiveAt).toBe(T_30s);
      expect(snap.participants).toHaveLength(1);
      expect(snap.participants[0].id).toBe('s1');
      expect(snap.participants[0].leftAt).toBeNull();
    });
  });

  describe('fromSnapshot (복원)', () => {
    it('open 상태의 snapshot으로부터 동일한 Meeting을 복원한다', () => {
      const m = newMeeting();
      m.addParticipant('s1', 'alice', T_30s);
      m.addParticipant('s2', 'bob', T_30s);
      const restored = Meeting.fromSnapshot(m.snapshot());
      expect(restored.snapshot()).toEqual(m.snapshot());
      expect(restored.isOpen).toBe(true);
      expect(restored.activeParticipantCount).toBe(2);
      expect(restored.hostToken).toBe('host-token-1');
    });

    it('close 된 snapshot도 ended 상태 그대로 복원한다(다시 mutate 불가)', () => {
      const m = newMeeting();
      m.addParticipant('s1', 'alice', T_30s);
      m.close(T_1m);
      const restored = Meeting.fromSnapshot(m.snapshot());
      expect(restored.isOpen).toBe(false);
      expect(restored.endedAt?.getTime()).toBe(T_1m.getTime());
      expect(() => restored.addParticipant('s2', 'bob', T_1m)).toThrow(/already closed/);
    });

    it('leave 한 참가자도 그대로 복원한다(findParticipant로 조회 가능)', () => {
      const m = newMeeting();
      m.addParticipant('s1', 'alice', T_30s);
      m.removeParticipant('s1', T_1m);
      const restored = Meeting.fromSnapshot(m.snapshot());
      const found = restored.findParticipant('s1');
      expect(found?.isActive).toBe(false);
      expect(found?.leftAt?.getTime()).toBe(T_1m.getTime());
    });

    it('복원된 Meeting에서 동일한 idle 조건이 그대로 평가된다', () => {
      const m = newMeeting();
      m.addParticipant('s1', 'alice', T_30s);
      m.removeParticipant('s1', T_1m);
      const restored = Meeting.fromSnapshot(m.snapshot());
      expect(restored.isIdleSince(T_10m_after_T_1m)).toBe(true);
    });
  });
  describe('createScheduled (lazy 방)', () => {
    const newScheduled = () =>
      Meeting.createScheduled({
        code: MeetingCode.from('abc12xyz'),
        source: 'notion-issue',
        externalReference: externalReference(),
        idleTimeout: IdleTimeout.default(),
        createdAt: T_0,
        hostToken: 'host-token-1',
        title: null,
      });

    it('scheduled 상태로 발급되고 아직 열린 회의가 아니다', () => {
      const m = newScheduled();
      expect(m.status).toBe('scheduled');
      expect(m.isOpen).toBe(false);
      expect(m.endedAt).toBeNull();
      expect(m.activeParticipantCount).toBe(0);
    });

    it('아무도 들어오지 않은 예약 회의는 idle 만료 대상이 아니다', () => {
      const m = newScheduled();
      expect(m.isIdleSince(T_10m_after_T_1m)).toBe(false);
    });

    it('첫 참가자가 들어오면 open으로 전이하고 startedAt이 그 시각이 된다', () => {
      const m = newScheduled();
      m.addParticipant('s1', 'alice', T_1m);
      expect(m.status).toBe('open');
      expect(m.startedAt).toBe(T_1m);
      expect(m.lastActiveAt).toBe(T_1m);
      expect(m.activeParticipantCount).toBe(1);
    });

    it('열린 뒤에는 참가자가 더 들어와도 startedAt이 바뀌지 않는다', () => {
      const m = newScheduled();
      m.addParticipant('s1', 'alice', T_1m);
      m.addParticipant('s2', 'bob', T_10m_after_T_1m);
      expect(m.startedAt).toBe(T_1m);
    });

    it('열린 뒤 전원이 나가면 idle 만료 대상이 된다', () => {
      const m = newScheduled();
      m.addParticipant('s1', 'alice', T_0);
      m.removeParticipant('s1', T_0);
      expect(m.isIdleSince(T_1m)).toBe(true);
    });

    it('status는 snapshot round-trip에서 보존된다', () => {
      const m = newScheduled();
      const restored = Meeting.fromSnapshot(m.snapshot());
      expect(restored.status).toBe('scheduled');
      expect(restored.isOpen).toBe(false);
    });
  });

  describe('status', () => {
    it('즉시 생성한 회의는 open, 종료하면 closed가 된다', () => {
      const m = newMeeting();
      expect(m.status).toBe('open');
      m.close(T_1m);
      expect(m.status).toBe('closed');
      expect(m.isOpen).toBe(false);
    });
  });
});
