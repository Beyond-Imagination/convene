import type { ConsumeRequest } from '@convene/shared-interfaces';
import { IsDefined, IsObject, IsString, Length, MaxLength } from 'class-validator';

import { MeetingCode } from '@/meeting/domain/value-objects/meeting-code';

const ID_MAX = 64;

export class ConsumeDto implements ConsumeRequest {
  @IsString()
  @Length(MeetingCode.LENGTH, MeetingCode.LENGTH)
  code!: string;

  @IsString()
  @MaxLength(ID_MAX)
  transportId!: string;

  @IsString()
  @MaxLength(ID_MAX)
  producerId!: string;

  @IsDefined()
  @IsObject()
  rtpCapabilities!: unknown;
}
