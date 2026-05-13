import { Clock } from '../../shared-kernel/domain/ports';
import { ExternalReference, Source } from '../../shared-kernel/domain/value-objects';
import { Meeting } from '../domain/meeting';
import { Participant } from '../domain/participant';
import { MeetingCodeGenerator, MeetingRepository } from '../domain/ports';
import { IdleTimeout } from '../domain/value-objects';

/**
 * Meeting Bounded Context의 Application Service.
 *
 * Use case 단위로 도메인 객체를 조립하고 Repository / Clock / CodeGenerator
 * 같은 Port 의존성을 호출한다. 도메인 이벤트 발행도 본 layer에서 수행한다
 * (ARCHITECTURE.md §3).
 */

export interface CreateMeetingCommand {
  source: Source;
  externalReference: ExternalReference;
}

export interface JoinMeetingCommand {
  code: string;
  participantId: string;
  nickname: string;
}

export interface JoinMeetingResult {
  meeting: Meeting;
  participant: Participant;
}

export interface LeaveMeetingCommand {
  code: string;
  participantId: string;
}

export interface MeetingServiceDeps {
  repository: MeetingRepository;
  codeGenerator: MeetingCodeGenerator;
  clock: Clock;
}

export class MeetingService {
  constructor(private readonly deps: MeetingServiceDeps) {}

  async createMeeting(command: CreateMeetingCommand): Promise<Meeting> {
    const code = this.deps.codeGenerator.next();
    const meeting = Meeting.create({
      code,
      source: command.source,
      externalReference: command.externalReference,
      idleTimeout: IdleTimeout.default(),
      startedAt: this.deps.clock.now(),
    });
    await this.deps.repository.save(meeting);
    return meeting;
  }

  async joinMeeting(_command: JoinMeetingCommand): Promise<JoinMeetingResult> {
    throw new Error('MeetingService.joinMeeting not implemented');
  }

  async leaveMeeting(_command: LeaveMeetingCommand): Promise<Meeting> {
    throw new Error('MeetingService.leaveMeeting not implemented');
  }
}
