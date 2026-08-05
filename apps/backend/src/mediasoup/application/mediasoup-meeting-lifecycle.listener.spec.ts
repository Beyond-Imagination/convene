import { ParticipantMedia } from '@/mediasoup/domain/participant-media';
import { stub } from '@/shared-kernel/testing/stub';

import { MediasoupMeetingLifecycleListener } from './mediasoup-meeting-lifecycle.listener';
import { MediasoupSignalingService } from './mediasoup-signaling.service';

interface CapturedCall {
  name: string;
  args: unknown[];
}

const makeListener = () => {
  const calls: CapturedCall[] = [];
  const service = stub<MediasoupSignalingService>({
    openRoom: async (cmd) => {
      calls.push({ name: 'openRoom', args: [cmd] });
    },
    closeRoom: async (cmd) => {
      calls.push({ name: 'closeRoom', args: [cmd] });
    },
    admitParticipant: async (cmd) => {
      calls.push({ name: 'admitParticipant', args: [cmd] });
      return ParticipantMedia.spawn({
        participantId: cmd.participantId,
        meetingCode: cmd.meetingCode,
        routerIndex: 0,
      });
    },
    dismissParticipant: async (cmd) => {
      calls.push({ name: 'dismissParticipant', args: [cmd] });
    },
  });
  const listener = new MediasoupMeetingLifecycleListener(service);
  return { listener, calls };
};

describe('MediasoupMeetingLifecycleListener', () => {
  const code = 'abc12xyz';

  it('meeting.opened → MediasoupSignalingService.openRoom을 호출한다', async () => {
    const { listener, calls } = makeListener();
    await listener.onMeetingOpened({ code });
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
