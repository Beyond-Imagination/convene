import { IsIn, IsString, Length } from 'class-validator';

import {
  type CreateTransportRequest,
  type TransportDirection,
  TRANSPORT_DIRECTIONS,
} from '@migration/shared-interfaces';

import { MeetingCode } from '@/meeting/domain/value-objects';

export class CreateTransportDto implements CreateTransportRequest {
  @IsString()
  @Length(MeetingCode.LENGTH, MeetingCode.LENGTH)
  code!: string;

  @IsIn(TRANSPORT_DIRECTIONS as unknown as string[])
  direction!: TransportDirection;
}
