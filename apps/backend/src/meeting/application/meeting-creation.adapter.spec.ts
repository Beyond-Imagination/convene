import { MeetingService } from '@/meeting/application/meeting.service';
import { MeetingCreationAdapter } from '@/meeting/application/meeting-creation.adapter';
import { CreateMeetingInput } from '@/shared-kernel/domain/ports';
import { externalReference } from '@/shared-kernel/domain/value-objects';

interface FakeCreateResult {
  code: { value: string };
  hostToken: string;
  startedAt: Date;
}

function fakeService(result: FakeCreateResult): {
  service: MeetingService;
  lastCommand: () => unknown;
} {
  let captured: unknown;
  const service = {
    createMeeting: async (command: unknown): Promise<FakeCreateResult> => {
      captured = command;
      return result;
    },
  } as unknown as MeetingService;
  return { service, lastCommand: () => captured };
}

describe('MeetingCreationAdapter', () => {
  it('MeetingService.createMeeting에 입력을 위임하고 결과를 primitive 스냅샷으로 변환한다', async () => {
    const startedAt = new Date('2026-07-20T00:00:00.000Z');
    const { service, lastCommand } = fakeService({
      code: { value: 'ABC123' },
      hostToken: 'host-tok',
      startedAt,
    });
    const ref = externalReference({ issueId: 'issue-1' });
    const input: CreateMeetingInput = {
      source: 'notion-issue',
      meetingType: 'general',
      externalReference: ref,
      title: '스프린트 회고',
    };

    const result = await new MeetingCreationAdapter(service).create(input);

    expect(result).toEqual({ code: 'ABC123', hostToken: 'host-tok', startedAt });
    expect(lastCommand()).toEqual({
      source: 'notion-issue',
      meetingType: 'general',
      externalReference: ref,
      title: '스프린트 회고',
    });
  });

  it('title 미지정이면 null로 위임한다', async () => {
    const { service, lastCommand } = fakeService({
      code: { value: 'X' },
      hostToken: 'h',
      startedAt: new Date(),
    });

    await new MeetingCreationAdapter(service).create({
      source: 'notion-issue',
      externalReference: {},
    });

    expect((lastCommand() as { title: unknown }).title).toBeNull();
  });
});
