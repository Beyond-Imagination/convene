import type { GetRtpCapabilitiesRequest } from '@migration/shared-interfaces';
import { IsString, Length } from 'class-validator';

import { MeetingCode } from '@/meeting/domain/value-objects';

export class GetRtpCapabilitiesDto implements GetRtpCapabilitiesRequest {
  @IsString()
  @Length(MeetingCode.LENGTH, MeetingCode.LENGTH)
  code!: string;
}
