import { MeetingService } from '@/meeting/application/meeting.service';
import { CreatedMeeting, CreateMeetingInput, MeetingCreationPort } from '@/shared-kernel/domain/ports';

export class MeetingCreationAdapter implements MeetingCreationPort {
  constructor(private readonly service: MeetingService) {}

  async create(input: CreateMeetingInput): Promise<CreatedMeeting> {
    const meeting = await this.service.createMeeting({
      source: input.source,
      meetingType: input.meetingType,
      externalReference: input.externalReference,
      title: input.title ?? null,
      scheduled: input.scheduled,
    });
    return {
      code: meeting.code.value,
      hostToken: meeting.hostToken,
      startedAt: meeting.startedAt,
    };
  }
}
