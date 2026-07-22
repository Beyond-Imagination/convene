import { IsNotEmpty, IsString } from 'class-validator';

/** 즉시 경로의 파라미터(GET 확인 페이지 query · POST 생성 body 공용). */
export class NotionMeetingParamsDto {
  @IsString()
  @IsNotEmpty()
  issueId!: string;

  @IsString()
  @IsNotEmpty()
  sig!: string;
}
