import type { ConnectTransportRequest } from '@migration/shared-interfaces';
import { IsDefined, IsObject, IsString, Length, MaxLength } from 'class-validator';

import { MeetingCode } from '@/meeting/domain/value-objects';

const TRANSPORT_ID_MAX = 64;

export class ConnectTransportDto implements ConnectTransportRequest {
  @IsString()
  @Length(MeetingCode.LENGTH, MeetingCode.LENGTH)
  code!: string;

  @IsString()
  @MaxLength(TRANSPORT_ID_MAX)
  transportId!: string;

  @IsDefined()
  @IsObject()
  dtlsParameters!: unknown;
}
