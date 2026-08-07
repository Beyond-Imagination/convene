import {
  type CloseProducerRequest,
  type ConnectTransportRequest,
  type ConsumeRequest,
  type CreateTransportRequest,
  type GetRtpCapabilitiesRequest,
  type ListProducersRequest,
  MEDIA_TYPES,
  type MediaType,
  type ProduceRequest,
  type ResumeConsumerRequest,
  type ToggleProducerRequest,
  TRANSPORT_DIRECTIONS,
  type TransportDirection,
} from '@convene/shared-interfaces';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

import { MeetingCode } from '@/meeting/domain/value-objects/meeting-code';

/** transport/producer/consumer 식별자 상한. mediasoup가 생성하는 uuid보다 넉넉하게 잡는다. */
const ID_MAX = 64;

/**
 * mediasoup WS 페이로드는 모두 회의 code를 싣는다.
 * 9개 DTO가 같은 검증을 반복하지 않도록 base로 둔다(class-validator 메타데이터는 상속된다).
 */
class MeetingScopedDto {
  @IsString()
  @Length(MeetingCode.LENGTH, MeetingCode.LENGTH)
  code!: string;
}

export class GetRtpCapabilitiesDto extends MeetingScopedDto implements GetRtpCapabilitiesRequest {}

export class ListProducersDto extends MeetingScopedDto implements ListProducersRequest {}

export class CreateTransportDto extends MeetingScopedDto implements CreateTransportRequest {
  @IsIn(TRANSPORT_DIRECTIONS as unknown as string[])
  direction!: TransportDirection;
}

export class ConnectTransportDto extends MeetingScopedDto implements ConnectTransportRequest {
  @IsString()
  @MaxLength(ID_MAX)
  transportId!: string;

  @IsDefined()
  @IsObject()
  dtlsParameters!: unknown;
}

export class ProduceDto extends MeetingScopedDto implements ProduceRequest {
  @IsString()
  @MaxLength(ID_MAX)
  transportId!: string;

  @IsIn(['audio', 'video'])
  kind!: 'audio' | 'video';

  @IsIn(MEDIA_TYPES as unknown as string[])
  source!: MediaType;

  @IsDefined()
  @IsObject()
  rtpParameters!: unknown;

  @IsOptional()
  @IsBoolean()
  paused?: boolean;
}

export class ConsumeDto extends MeetingScopedDto implements ConsumeRequest {
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

export class ResumeConsumerDto extends MeetingScopedDto implements ResumeConsumerRequest {
  @IsString()
  @MaxLength(ID_MAX)
  consumerId!: string;
}

export class ToggleProducerDto extends MeetingScopedDto implements ToggleProducerRequest {
  @IsString()
  @MaxLength(ID_MAX)
  producerId!: string;

  @IsBoolean()
  paused!: boolean;
}

export class CloseProducerDto extends MeetingScopedDto implements CloseProducerRequest {
  @IsString()
  @MaxLength(ID_MAX)
  producerId!: string;
}
