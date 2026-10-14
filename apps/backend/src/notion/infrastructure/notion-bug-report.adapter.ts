import {
  BugReport,
  BugReportImage,
  NotionBugReportPort,
} from '@/notion/domain/ports/notion-bug-report.port';
import { buildBugReportPage } from '@/notion/infrastructure/bug-report-blocks.mapper';
import { NotionHttpClient } from '@/notion/infrastructure/notion-http.client';
import { NOTION_ISSUE_PROPERTIES } from '@/notion/infrastructure/notion-issue.properties';

export const BUG_TYPE_OPTION = '버그';

interface IssueTarget {
  readonly dataSourceId: string;
  readonly titleProperty: string;
}

export class NotionBugReportAdapter implements NotionBugReportPort {
  /** 실패하면 비워 다음 접수 때 다시 조회한다(권한을 나중에 붙이는 경우). */
  private target: Promise<IssueTarget> | null = null;

  constructor(
    private readonly client: NotionHttpClient,
    private readonly databaseId: string,
  ) {}

  async createIssue(report: BugReport): Promise<void> {
    const { dataSourceId, titleProperty } = await this.resolveTarget();
    const { title, children } = buildBugReportPage(report);
    await this.client.createPage({
      parent: { type: 'data_source_id', data_source_id: dataSourceId },
      properties: {
        [titleProperty]: { title: [{ type: 'text', text: { content: title } }] },
        [NOTION_ISSUE_PROPERTIES.type]: { multi_select: [{ name: BUG_TYPE_OPTION }] },
      },
      children,
    });
  }

  async uploadImage(image: BugReportImage): Promise<string> {
    const uploadId = await this.client.createFileUpload(image.filename, image.contentType);
    await this.client.sendFileUpload(uploadId, image.bytes, image.filename, image.contentType);
    return uploadId;
  }

  private resolveTarget(): Promise<IssueTarget> {
    if (this.target === null) {
      this.target = this.lookupTarget().catch((error: unknown) => {
        this.target = null;
        throw error;
      });
    }
    return this.target;
  }

  // 2025-09-03 부터 페이지의 부모는 data source 다. 제목 속성 이름은 DB 마다 달라 타입으로 찾는다.
  private async lookupTarget(): Promise<IssueTarget> {
    const database = await this.client.retrieveDatabase(this.databaseId);
    const dataSourceId = ((database.data_sources ?? []) as ReadonlyArray<{ id?: unknown }>)[0]?.id;
    if (typeof dataSourceId !== 'string') {
      throw new Error(`버그 리포트 DB에 data source가 없습니다: ${this.databaseId}`);
    }
    const dataSource = await this.client.retrieveDataSource(dataSourceId);
    const properties = (dataSource.properties ?? {}) as Record<string, { type?: unknown }>;
    const titleProperty = Object.keys(properties).find((name) => properties[name].type === 'title');
    if (titleProperty === undefined) {
      throw new Error(`버그 리포트 DB에 제목 속성이 없습니다: ${this.databaseId}`);
    }
    return { dataSourceId, titleProperty };
  }
}
