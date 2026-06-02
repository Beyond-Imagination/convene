import type { CloseProducerRequest } from '@migration/shared-interfaces';
import { IsString, Length, MaxLength } from 'class-validator';

import { MeetingCode } from '@/meeting/domain/value-objects';

const ID_MAX = 64;

/**
 * 자기 producer 를 닫는 RPC(예: 화면 공유 중지)의 입력 DTO.
 * 소유 검증은 application layer(`closeProducer`)가 담당한다.
 */
export class CloseProducerDto implements CloseProducerRequest {
  @IsString()
  @Length(MeetingCode.LENGTH, MeetingCode.LENGTH)
  code!: string;

  @IsString()
  @MaxLength(ID_MAX)
  producerId!: string;
}
