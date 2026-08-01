import { Injectable } from '@nestjs/common';

import { Meeting } from '@/meeting/domain/meeting';
import { MeetingRepository } from '@/meeting/domain/ports';

import { RedisMeetingRepository } from './redis-meeting.repository';

@Injectable()
export class CachedMeetingRepository implements MeetingRepository {
  constructor(
    private readonly cache: RedisMeetingRepository,
    private readonly origin: MeetingRepository,
  ) {}

  async findByCode(_code: string): Promise<Meeting | null> {
    throw new Error('not implemented');
  }

  async save(_meeting: Meeting): Promise<void> {
    throw new Error('not implemented');
  }

  async listOpenCodes(): Promise<string[]> {
    throw new Error('not implemented');
  }
}
