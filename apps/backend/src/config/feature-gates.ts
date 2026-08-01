import { resolveAdminConfig } from './admin.config';
import { resolveGeminiConfig } from './gemini.config';
import { resolveNotionConfig } from './notion.config';

/**
 * env 주입 여부로 갈리는 선택 기능들의 현재 상태.
 *
 * 이 기능들은 값이 없으면 조용히 dormant 라 "켠 줄 알았는데 안 켜진" 상태를 밖에서 알 수 없다.
 * 부팅 로그에 실어 배포 직후 확인할 수 있게 한다.
 */
export interface FeatureGates {
  /** 회의록을 노션 이슈에 삽입. */
  readonly notionReportPush: boolean;
  /** 이슈 폴링으로 회의 사전 발급. */
  readonly notionPolling: boolean;
  /** 노션 버튼(서명된 회의 생성 경로). */
  readonly notionButton: boolean;
  /** LLM 요약. 없으면 Noop 으로 대체된다. */
  readonly summarizer: boolean;
  readonly adminApi: boolean;
}

export function resolveFeatureGates(env: NodeJS.ProcessEnv = process.env): FeatureGates {
  const notion = resolveNotionConfig(env);
  return {
    notionReportPush: notion !== null,
    notionPolling: notion !== null && notion.databaseIds.length > 0,
    notionButton: notion !== null && notion.signingSecret !== null,
    summarizer: resolveGeminiConfig(env) !== null,
    adminApi: resolveAdminConfig(env) !== null,
  };
}
