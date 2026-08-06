import { MeetingReport } from '@/reports/domain/meeting-report';
import { MeetingEndedPayload } from '@/shared-kernel/domain/domain-event.payloads';
import { NO_EXTERNAL_REFERENCE } from '@/shared-kernel/domain/value-objects/external-reference';
import { stub } from '@/shared-kernel/testing/stub';

import { CreateDraftCommand, ReportFinalizationService } from './report-finalization.service';
import { ReportMeetingLifecycleListener } from './report-meeting-lifecycle.listener';

const startedAt = new Date('2026-01-01T00:00:00Z');
const tJoin = new Date('2026-01-01T00:01:00Z');
const endedAt = new Date('2026-01-01T00:30:00Z');

const payload: MeetingEndedPayload = {
  code: 'abc12xyz',
  source: 'web',
  meetingType: 'general',
  externalReference: NO_EXTERNAL_REFERENCE,
  startedAt,
  endedAt,
  reason: 'manual',
  participants: [{ id: 's1', nickname: 'alice', joinedAt: tJoin, leftAt: endedAt }],
  chat: [{ nickname: 'alice', text: '안녕', sentAt: tJoin }],
  title: null,
};

const makeListener = () => {
  const calls: CreateDraftCommand[] = [];
  const service = stub<ReportFinalizationService>({
    createDraft: jest.fn(async (cmd: CreateDraftCommand) => {
      calls.push(cmd);
      // id는 실제 서비스가 발급한다. 대역은 리스너가 반환값을 쓰지 않더라도 계약은 지킨다.
      return MeetingReport.fromEndedMeeting({ ...cmd, id: 'rep_stub', title: cmd.title ?? null });
    }),
  });
  const listener = new ReportMeetingLifecycleListener(service);
  return { listener, calls, service };
};

describe('ReportMeetingLifecycleListener', () => {
  it('meeting.ended → ReportFinalizationService.createDraft를 한 번 호출한다', async () => {
    const { listener, service } = makeListener();
    await listener.onMeetingEnded(payload);
    expect(service.createDraft).toHaveBeenCalledTimes(1);
  });

  it('payload.code를 meetingId/code 양쪽으로 전달한다 (v1: Meeting 식별자=code)', async () => {
    const { listener, calls } = makeListener();
    await listener.onMeetingEnded(payload);
    expect(calls[0].meetingId).toBe(payload.code);
    expect(calls[0].code).toBe(payload.code);
  });

  it('source/externalReference/startedAt/endedAt을 payload 그대로 전달한다', async () => {
    const { listener, calls } = makeListener();
    await listener.onMeetingEnded(payload);
    expect(calls[0].source).toBe(payload.source);
    expect(calls[0].externalReference).toBe(payload.externalReference);
    expect(calls[0].startedAt).toBe(payload.startedAt);
    expect(calls[0].endedAt).toBe(payload.endedAt);
  });

  it('participants snapshot을 ParticipantEntry 배열로 그대로 매핑한다', async () => {
    const { listener, calls } = makeListener();
    await listener.onMeetingEnded(payload);
    expect(calls[0].participants).toEqual(payload.participants);
  });

  it('chat snapshot을 그대로 전달한다', async () => {
    const { listener, calls } = makeListener();
    await listener.onMeetingEnded(payload);
    expect(calls[0].chat).toEqual(payload.chat);
  });
});
