import { ExternalReference, MeetingType, Source } from '@/shared-kernel/domain/value-objects';

// 다른 BC가 meeting 내부를 import하지 않고 회의 생성을 호출하는 Port(hard rule 7).
// shared-kernel에 추상만 두고 meeting BC가 구현한다.
export const MEETING_CREATION_PORT = Symbol('MEETING_CREATION_PORT');

export interface CreateMeetingInput {
  readonly source: Source;
  readonly meetingType?: MeetingType;
  readonly externalReference: ExternalReference;
  readonly title?: string | null;
}

export interface CreatedMeeting {
  readonly code: string;
  readonly hostToken: string;
  readonly startedAt: Date;
}

export interface MeetingCreationPort {
  create(input: CreateMeetingInput): Promise<CreatedMeeting>;
}
