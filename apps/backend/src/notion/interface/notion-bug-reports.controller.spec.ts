import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { NotionBugReportService } from '@/notion/application/notion-bug-report.service';
import { stub } from '@/shared-kernel/testing/stub';

import { NotionBugReportsController } from './notion-bug-reports.controller';
import { BugReportDto } from './notion-meeting-params.dto';

const valid = {
  summary: '소리가 안 들려요',
  locations: ['meeting'],
  steps: ['입장'],
  imageUploadIds: [],
};

const errorsOf = async (body: Record<string, unknown>): Promise<string[]> =>
  (
    await validate(plainToInstance(BugReportDto, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  ).map((e) => e.property);

describe('BugReportDto', () => {
  it('필수 항목만 있어도 통과한다', async () => {
    expect(await errorsOf(valid)).toEqual([]);
  });

  it('무슨 일이 있었나요는 비어 있으면 안 되고 길이 상한이 있다', async () => {
    expect(await errorsOf({ ...valid, summary: '  ' })).toContain('summary');
    expect(await errorsOf({ ...valid, summary: '가'.repeat(301) })).toContain('summary');
  });

  it('발생 위치는 하나 이상, 정해진 값만 받는다', async () => {
    expect(await errorsOf({ ...valid, locations: [] })).toContain('locations');
    expect(await errorsOf({ ...valid, locations: ['kitchen'] })).toContain('locations');
  });

  it('재현 단계와 이미지 수에 상한이 있다', async () => {
    expect(await errorsOf({ ...valid, steps: Array(11).fill('a') })).toContain('steps');
    expect(
      await errorsOf({
        ...valid,
        imageUploadIds: Array.from({ length: 6 }, () => '0d5b2a8e-1c3f-4a6b-9d2e-7f8a9b0c1d2e'),
      }),
    ).toContain('imageUploadIds');
  });

  it('이미지 업로드 id는 UUID만 받는다', async () => {
    expect(await errorsOf({ ...valid, imageUploadIds: ['../../etc'] })).toContain('imageUploadIds');
  });

  it('선택 항목은 길이 상한을 지킨다', async () => {
    expect(await errorsOf({ ...valid, notes: '가'.repeat(2001) })).toContain('notes');
    expect(await errorsOf({ ...valid, browser: '가'.repeat(201) })).toContain('browser');
  });

  it('모르는 필드는 거절한다', async () => {
    expect(await errorsOf({ ...valid, admin: true })).toContain('admin');
  });
});

describe('NotionBugReportsController', () => {
  const setup = () => {
    const submit = jest.fn().mockResolvedValue(undefined);
    const uploadImage = jest.fn().mockResolvedValue('fu-1');
    const controller = new NotionBugReportsController(
      stub<NotionBugReportService>({ submit, uploadImage }),
    );
    return { controller, submit, uploadImage };
  };

  const file = (mimetype: string) => ({
    originalname: 'shot.png',
    mimetype,
    size: 3,
    buffer: Buffer.from([1, 2, 3]),
  });

  it('접수 본문을 서비스에 넘긴다', async () => {
    const { controller, submit } = setup();
    await controller.submit(plainToInstance(BugReportDto, valid));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ summary: '소리가 안 들려요' }));
  });

  it('이미지를 올리면 업로드 id를 돌려준다', async () => {
    const { controller, uploadImage } = setup();
    expect(await controller.uploadImage(file('image/png'))).toEqual({ uploadId: 'fu-1' });
    expect(uploadImage).toHaveBeenCalledWith({
      filename: 'shot.png',
      contentType: 'image/png',
      bytes: expect.any(Uint8Array),
    });
  });

  it('이미지가 아니거나 파일이 없으면 400', async () => {
    const { controller, uploadImage } = setup();
    await expect(controller.uploadImage(file('video/mp4'))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.uploadImage(undefined)).rejects.toBeInstanceOf(BadRequestException);
    expect(uploadImage).not.toHaveBeenCalled();
  });
});
