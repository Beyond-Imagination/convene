import type { CloseProducerRequest } from '@convene/shared-interfaces';
import { IsString, Length, MaxLength } from 'class-validator';

import { MeetingCode } from '@/meeting/domain/value-objects/meeting-code';

const ID_MAX = 64;

export class CloseProducerDto implements CloseProducerRequest {
  @IsString()
  @Length(MeetingCode.LENGTH, MeetingCode.LENGTH)
  code!: string;

  @IsString()
  @MaxLength(ID_MAX)
  producerId!: string;
}
