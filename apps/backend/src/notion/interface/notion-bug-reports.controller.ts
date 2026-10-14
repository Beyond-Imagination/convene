import { BUG_REPORT_LIMITS, type BugReportImageUploadResponse } from '@convene/shared-interfaces';
import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { NotionBugReportService } from '@/notion/application/notion-bug-report.service';
import { BugReportDto } from '@/notion/interface/notion-meeting-params.dto';

/** multer 가 넘기는 파일 중 쓰는 필드만. */
export interface UploadedImageFile {
  readonly originalname: string;
  readonly mimetype: string;
  readonly size: number;
  readonly buffer: Buffer;
}

const IMAGE_TYPES: ReadonlyArray<string> = BUG_REPORT_LIMITS.imageTypes;

// 노션 계정이 없는 사람도 접수할 수 있도록 공개한다. 남용은 서비스의 시간당 상한이 막는다.
@Controller('bug-reports')
export class NotionBugReportsController {
  constructor(private readonly service: NotionBugReportService) {}

  @Post()
  async submit(@Body() body: BugReportDto): Promise<void> {
    await this.service.submit(body);
  }

  // 용량 상한을 넘는 파일은 multer 가 413 으로 끊는다.
  @Post('images')
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: BUG_REPORT_LIMITS.imageBytesMax, files: 1 } }),
  )
  async uploadImage(
    @UploadedFile() file: UploadedImageFile | undefined,
  ): Promise<BugReportImageUploadResponse> {
    if (file === undefined || !IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('PNG·JPEG·GIF·WebP 이미지만 올릴 수 있습니다.');
    }
    const uploadId = await this.service.uploadImage({
      filename: file.originalname,
      contentType: file.mimetype,
      bytes: new Uint8Array(file.buffer),
    });
    return { uploadId };
  }
}
