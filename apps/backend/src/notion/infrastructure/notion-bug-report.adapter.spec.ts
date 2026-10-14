import { BugReport } from '@/notion/domain/ports/notion-bug-report.port';
import { stub } from '@/shared-kernel/testing/stub';

import { NotionBugReportAdapter } from './notion-bug-report.adapter';
import { NotionHttpClient } from './notion-http.client';

const report: BugReport = {
  summary: '소리가 안 들려요',
  locations: ['meeting'],
  steps: [],
  imageUploadIds: ['fu-1'],
  reportedAt: new Date('2026-10-14T05:30:00.000Z'),
};

const makeClient = () => {
  const client = {
    retrieveDatabase: jest.fn().mockResolvedValue({ data_sources: [{ id: 'ds-1' }] }),
    retrieveDataSource: jest.fn().mockResolvedValue({
      properties: {
        상태: { type: 'status' },
        이름: { type: 'title' },
        유형: { type: 'multi_select' },
      },
    }),
    createPage: jest.fn().mockResolvedValue({ id: 'page-1' }),
    createFileUpload: jest.fn().mockResolvedValue('fu-9'),
    sendFileUpload: jest.fn().mockResolvedValue(undefined),
  };
  return { client, adapter: new NotionBugReportAdapter(stub<NotionHttpClient>(client), 'db-bug') };
};

describe('NotionBugReportAdapter', () => {
  it('버그 이슈를 DB의 data source 아래에 유형=버그로 만든다', async () => {
    const { client, adapter } = makeClient();
    await adapter.createIssue(report);

    expect(client.retrieveDatabase).toHaveBeenCalledWith('db-bug');
    const body = client.createPage.mock.calls[0][0];
    expect(body.parent).toEqual({ type: 'data_source_id', data_source_id: 'ds-1' });
    expect(body.properties).toEqual({
      이름: { title: [{ type: 'text', text: { content: '[버그] 소리가 안 들려요' } }] },
      유형: { multi_select: [{ name: '버그' }] },
    });
    expect(body.children.some((b: { type: string }) => b.type === 'image')).toBe(true);
  });

  it('data source 와 제목 속성 이름은 한 번만 조회해 재사용한다', async () => {
    const { client, adapter } = makeClient();
    await adapter.createIssue(report);
    await adapter.createIssue(report);
    expect(client.retrieveDatabase).toHaveBeenCalledTimes(1);
    expect(client.retrieveDataSource).toHaveBeenCalledTimes(1);
    expect(client.createPage).toHaveBeenCalledTimes(2);
  });

  it('조회가 실패하면 다음 접수 때 다시 조회한다', async () => {
    const { client, adapter } = makeClient();
    client.retrieveDatabase.mockRejectedValueOnce(new Error('권한 없음'));
    await expect(adapter.createIssue(report)).rejects.toThrow();
    await adapter.createIssue(report);
    expect(client.retrieveDatabase).toHaveBeenCalledTimes(2);
  });

  it('이미지는 노션 파일 업로드를 만들고 보낸 뒤 그 id를 돌려준다', async () => {
    const { client, adapter } = makeClient();
    const bytes = new Uint8Array([1, 2]);
    const id = await adapter.uploadImage({ filename: 'a.png', contentType: 'image/png', bytes });
    expect(client.createFileUpload).toHaveBeenCalledWith('a.png', 'image/png');
    expect(client.sendFileUpload).toHaveBeenCalledWith('fu-9', bytes, 'a.png', 'image/png');
    expect(id).toBe('fu-9');
  });
});
