import { NotionBugReportPort } from '@/notion/domain/ports/notion-bug-report.port';
import { BugReportRateLimiter } from '@/notion/infrastructure/bug-report-rate-limiter';
import { TooManyRequestsError } from '@/shared-kernel/domain/errors';
import { stub } from '@/shared-kernel/testing/stub';

import { NotionBugReportService } from './notion-bug-report.service';

const NOW = new Date('2026-10-14T05:30:00.000Z');

const setup = (allowed = true) => {
  const port: jest.Mocked<NotionBugReportPort> = {
    createIssue: jest.fn().mockResolvedValue(undefined),
    uploadImage: jest.fn().mockResolvedValue('fu-1'),
  };
  const tryAcquire = jest.fn().mockResolvedValue(allowed);
  const limiter = stub<BugReportRateLimiter>({ tryAcquire });
  const service = new NotionBugReportService(port, limiter, { now: () => NOW });
  return { port, tryAcquire, service };
};

const request = {
  summary: '소리가 안 들려요',
  locations: ['meeting' as const],
  steps: [],
  imageUploadIds: [],
};

const image = { filename: 'a.png', contentType: 'image/png', bytes: new Uint8Array([1]) };

describe('NotionBugReportService', () => {
  it('접수하면 접수 시각을 붙여 노션 이슈를 만든다', async () => {
    const { port, service } = setup();
    await service.submit(request);
    expect(port.createIssue).toHaveBeenCalledWith({ ...request, reportedAt: NOW });
  });

  it('시간당 상한을 넘으면 TooManyRequestsError를 던지고 이슈를 만들지 않는다', async () => {
    const { port, service } = setup(false);
    await expect(service.submit(request)).rejects.toBeInstanceOf(TooManyRequestsError);
    expect(port.createIssue).not.toHaveBeenCalled();
  });

  it('이미지를 올리고 업로드 id를 돌려준다', async () => {
    const { port, tryAcquire, service } = setup();
    expect(await service.uploadImage(image)).toBe('fu-1');
    expect(port.uploadImage).toHaveBeenCalledWith(image);
    expect(tryAcquire).toHaveBeenCalledWith('image');
  });

  it('이미지도 상한을 넘으면 올리지 않는다', async () => {
    const { port, service } = setup(false);
    await expect(service.uploadImage(image)).rejects.toBeInstanceOf(TooManyRequestsError);
    expect(port.uploadImage).not.toHaveBeenCalled();
  });
});
