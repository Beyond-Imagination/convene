import type { ToggleProducerRequest } from '@convene/shared-interfaces';
import { IsBoolean, IsString, Length, MaxLength } from 'class-validator';

import { MeetingCode } from '@/meeting/domain/value-objects';

const ID_MAX = 64;

/**
 * 자기 producer 를 mute(paused:true)/unmute(paused:false) 하는 RPC 의 입력 DTO.
 * 소유 검증은 application layer(`toggleProducer`) 가 담당한다.
 */
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
