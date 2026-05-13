import { Clock } from '../../shared-kernel/domain/ports';
import { ExternalReference, Source } from '../../shared-kernel/domain/value-objects';
import { Meeting } from '../domain/meeting';
import { MeetingCodeGenerator, MeetingRepository } from '../domain/ports';

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

export interface MeetingServiceDeps {
  repository: MeetingRepository;
  codeGenerator: MeetingCodeGenerator;
  clock: Clock;
}

export class MeetingService {
  constructor(private readonly deps: MeetingServiceDeps) {}

  async createMeeting(_command: CreateMeetingCommand): Promise<Meeting> {
    throw new Error('MeetingService.createMeeting not implemented');
  }
}
