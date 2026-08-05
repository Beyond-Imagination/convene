import type { ListProducersRequest } from '@convene/shared-interfaces';
import { IsString, Length } from 'class-validator';

import { MeetingCode } from '@/meeting/domain/value-objects/meeting-code';

export class ListProducersDto implements ListProducersRequest {
  @IsString()
  @Length(MeetingCode.LENGTH, MeetingCode.LENGTH)
  code!: string;
}
