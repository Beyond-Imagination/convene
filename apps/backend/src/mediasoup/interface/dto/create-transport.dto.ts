import {
  type CreateTransportRequest,
  TRANSPORT_DIRECTIONS,
  type TransportDirection,
} from '@convene/shared-interfaces';
import { IsIn, IsString, Length } from 'class-validator';

import { MeetingCode } from '@/meeting/domain/value-objects';

export class CreateTransportDto implements CreateTransportRequest {
  @IsString()
  @Length(MeetingCode.LENGTH, MeetingCode.LENGTH)
  code!: string;

  @IsIn(TRANSPORT_DIRECTIONS as unknown as string[])
  direction!: TransportDirection;
}
