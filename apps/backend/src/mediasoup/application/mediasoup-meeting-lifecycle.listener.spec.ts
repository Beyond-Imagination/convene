import { MediasoupMeetingLifecycleListener } from './mediasoup-meeting-lifecycle.listener';
import { MediasoupSignalingService } from './mediasoup-signaling.service';

interface CapturedCall {
  name: string;
  args: unknown[];
}

const makeListener = () => {
  const calls: CapturedCall[] = [];
  const service = {
    openRoom: async (cmd: unknown) => {
      calls.push({ name: 'openRoom', args: [cmd] });
    },
    closeRoom: async (cmd: unknown) => {
      calls.push({ name: 'closeRoom', args: [cmd] });
    },
    admitParticipant: async (cmd: unknown) => {
      calls.push({ name: 'admitParticipant', args: [cmd] });
      return undefined;
    },
    dismissParticipant: async (cmd: unknown) => {
      calls.push({ name: 'dismissParticipant', args: [cmd] });
    },
  };
  const listener = new MediasoupMeetingLifecycleListener(
    service as unknown as MediasoupSignalingService,
  );
  return { listener, calls };
};

describe('MediasoupMeetingLifecycleListener', () => {
  const code = 'abc12xyz';

  it('meeting.created → MediasoupSignalingService.openRoom을 호출한다', async () => {
    const { listener, calls } = makeListener();
    await listener.onMeetingCreated({ code });
    expect(calls).toEqual([{ name: 'openRoom', args: [{ meetingCode: code }] }]);
  });

  it('meeting.participant.joined → admitParticipant(code, participantId) 호출', async () => {
    const { listener, calls } = makeListener();
    await listener.onParticipantJoined({ code, participantId: 's1' });
    expect(calls).toEqual([
      { name: 'admitParticipant', args: [{ meetingCode: code, participantId: 's1' }] },
    ]);
  });

  it('meeting.participant.left → dismissParticipant(code, participantId) 호출', async () => {
    const { listener, calls } = makeListener();
    await listener.onParticipantLeft({ code, participantId: 's1' });
    expect(calls).toEqual([
      { name: 'dismissParticipant', args: [{ meetingCode: code, participantId: 's1' }] },
    ]);
  });

  it('meeting.ended → closeRoom(code) 호출', async () => {
    const { listener, calls } = makeListener();
    await listener.onMeetingEnded({ code });
    expect(calls).toEqual([{ name: 'closeRoom', args: [{ meetingCode: code }] }]);
  });
});
