import type { ToggleProducerRequest } from '@convene/shared-interfaces';
import { IsBoolean, IsString, Length, MaxLength } from 'class-validator';

import { MeetingCode } from '@/meeting/domain/value-objects';

const ID_MAX = 64;

export class ToggleProducerDto implements ToggleProducerRequest {
  @IsString()
  @Length(MeetingCode.LENGTH, MeetingCode.LENGTH)
  code!: string;

  @IsString()
  @MaxLength(ID_MAX)
  producerId!: string;

  @IsBoolean()
  paused!: boolean;
}
