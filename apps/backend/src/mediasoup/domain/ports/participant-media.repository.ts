import { ParticipantMedia } from '@/mediasoup/domain/participant-media';

/**
 * ParticipantMedia Aggregate 의 영속/조회 경계. 구현체는 infrastructure 의
 * in-memory 스토리지를 제공한다.
 *
 * participantId 는 글로벌 socket id 이므로 단독 키로 충분하고,
 * meetingCode 로 같은 회의의 모든 ParticipantMedia 를 그룹 조회한다
 * (새 Producer 알림 브로드캐스트 대상 결정).
 */
export interface ParticipantMediaRepository {
  save(media: ParticipantMedia): Promise<void>;

  findByParticipantId(participantId: string): Promise<ParticipantMedia | null>;

  findByMeetingCode(meetingCode: string): Promise<ParticipantMedia[]>;

  removeByParticipantId(participantId: string): Promise<void>;

  removeAllByMeetingCode(meetingCode: string): Promise<void>;
}
