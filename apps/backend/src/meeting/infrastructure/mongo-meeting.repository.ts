import { Inject, Injectable } from '@nestjs/common';
import { Connection } from 'mongoose';

import { Meeting } from '@/meeting/domain/meeting';
import { MeetingRepository } from '@/meeting/domain/ports';

@Injectable()
export class MongoMeetingRepository implements MeetingRepository {
  constructor(@Inject(Connection) private readonly connection: Connection) {}

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
