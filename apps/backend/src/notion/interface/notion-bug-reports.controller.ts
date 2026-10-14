import { BugReportImageUploadResponse } from '@convene/shared-interfaces';

import { NotionBugReportService } from '@/notion/application/notion-bug-report.service';
import { BugReportDto } from '@/notion/interface/notion-meeting-params.dto';

export interface UploadedImageFile {
  readonly originalname: string;
  readonly mimetype: string;
  readonly size: number;
  readonly buffer: Buffer;
}

export class NotionBugReportsController {
  constructor(private readonly service: NotionBugReportService) {}

  async submit(_body: BugReportDto): Promise<void> {
    throw new Error('not implemented');
  }

  async uploadImage(_file: UploadedImageFile | undefined): Promise<BugReportImageUploadResponse> {
    throw new Error('not implemented');
  }
}
