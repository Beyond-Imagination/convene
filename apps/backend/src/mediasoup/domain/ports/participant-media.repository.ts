import { ParticipantMedia } from '@/mediasoup/domain/participant-media';

export const PARTICIPANT_MEDIA_REPOSITORY = Symbol('PARTICIPANT_MEDIA_REPOSITORY');

/**
 * ParticipantMedia Aggregate의 영속/조회 경계. 구현체는 infrastructure의 in-memory 스토리지 제공
 *
 * participantId는 글로벌 socket id이므로 단독 키로 충분하고, meetingCode로 같은 회의의 모든 ParticipantMedia를 그룹 조회한다.
 */
export interface ParticipantMediaRepository {
  save(media: ParticipantMedia): Promise<void>;

  findByParticipantId(participantId: string): Promise<ParticipantMedia | null>;

  findByMeetingCode(meetingCode: string): Promise<ParticipantMedia[]>;

  removeByParticipantId(participantId: string): Promise<void>;

  removeAllByMeetingCode(meetingCode: string): Promise<void>;
}
