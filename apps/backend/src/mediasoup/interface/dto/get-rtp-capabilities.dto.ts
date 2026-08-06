import type { GetRtpCapabilitiesRequest } from '@convene/shared-interfaces';
import { IsString, Length } from 'class-validator';

import { MeetingCode } from '@/meeting/domain/value-objects/meeting-code';

export class GetRtpCapabilitiesDto implements GetRtpCapabilitiesRequest {
  @IsString()
  @Length(MeetingCode.LENGTH, MeetingCode.LENGTH)
  code!: string;
}
