import {
  BUG_REPORT_LIMITS,
  BUG_REPORT_LOCATIONS,
  type BugReportLocation,
  type BugReportRequest,
} from '@convene/shared-interfaces';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

/** 즉시 경로의 파라미터(GET 확인 페이지 query · POST 생성 body 공용). */
export class NotionMeetingParamsDto {
  @IsString()
  @IsNotEmpty()
  issueId!: string;

  @IsString()
  @IsNotEmpty()
  sig!: string;
}

const NOT_BLANK = /\S/;

/** Convene 화면의 버그 리포트 양식. 선택 항목이 많아 상한만 걸고 빈 값은 노션 본문에서 처리한다. */
export class BugReportDto implements BugReportRequest {
  @IsString()
  @Matches(NOT_BLANK)
  @MaxLength(BUG_REPORT_LIMITS.summaryMax)
  summary!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BUG_REPORT_LOCATIONS.length)
  @IsIn(BUG_REPORT_LOCATIONS, { each: true })
  locations!: BugReportLocation[];

  @IsOptional()
  @IsString()
  @MaxLength(BUG_REPORT_LIMITS.shortTextMax)
  otherLocation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(BUG_REPORT_LIMITS.shortTextMax)
  meetingCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(BUG_REPORT_LIMITS.shortTextMax)
  occurredAt?: string;

  @IsArray()
  @ArrayMaxSize(BUG_REPORT_LIMITS.stepsMax)
  @IsString({ each: true })
  @MaxLength(BUG_REPORT_LIMITS.textMax, { each: true })
  steps!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(BUG_REPORT_LIMITS.textMax)
  expected?: string;

  @IsOptional()
  @IsString()
  @MaxLength(BUG_REPORT_LIMITS.shortTextMax)
  device?: string;

  @IsOptional()
  @IsString()
  @MaxLength(BUG_REPORT_LIMITS.shortTextMax)
  browser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(BUG_REPORT_LIMITS.shortTextMax)
  network?: string;

  @IsOptional()
  @IsString()
  @MaxLength(BUG_REPORT_LIMITS.textMax)
  notes?: string;

  @IsArray()
  @ArrayMaxSize(BUG_REPORT_LIMITS.imagesMax)
  @IsUUID('all', { each: true })
  imageUploadIds!: string[];
}
