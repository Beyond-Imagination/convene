import { IsNotEmpty, IsString } from 'class-validator';

/** 즉시 버튼 진입(`GET /notion/meetings`)의 쿼리 파라미터. */
export class NotionMeetingQueryDto {
  @IsString()
  @IsNotEmpty()
  issueId!: string;

  @IsString()
  @IsNotEmpty()
  sig!: string;
}
