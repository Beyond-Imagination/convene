import { resolveAiWorkerConfig } from './ai-worker.config';
import { resolveGeminiConfig } from './gemini.config';
import { resolveLogLevel } from './logger.config';
import {
  resolveNumWorkers,
  resolveWebRtcTransportOptions,
  resolveWorkerOptions,
} from './mediasoup.config';
import { resolveMongoDbName, resolveMongoUri } from './mongo.config';
import { resolveNotionConfig } from './notion.config';
import { resolveRedisKeyPrefix, resolveRedisUrl } from './redis.config';
import { resolveCorsOrigins, resolvePort } from './server.config';

type Resolver = (env: NodeJS.ProcessEnv) => unknown;

/**
 * 부팅 시 한 번에 돌릴 해석기 목록. 기능 게이트(노션·Gemini·admin)는 미설정이면 `null`을
 * 돌려주고 throw 하지 않으므로, 여기 있어도 부팅을 막지 않는다 — 켜져 있는데 값 형식이
 * 틀린 경우만 잡힌다.
 */
const RESOLVERS: ReadonlyArray<Resolver> = [
  resolvePort,
  resolveCorsOrigins,
  resolveRedisUrl,
  resolveRedisKeyPrefix,
  resolveMongoUri,
  resolveMongoDbName,
  resolveAiWorkerConfig,
  resolveNumWorkers,
  resolveWorkerOptions,
  resolveWebRtcTransportOptions,
  resolveLogLevel,
  resolveGeminiConfig,
  resolveNotionConfig,
];

/**
 * 모든 env 해석기를 돌려 문제를 한 번에 보고한다.
 *
 * 해석기는 각자 첫 사용 시점에 throw 하므로, 그대로 두면 잘못된 설정이 부팅 한참 뒤
 * 엉뚱한 요청에서 드러난다. 부팅을 세우고 누락·형식 오류를 모아 한 번에 알린다.
 */
export function assertEnvIsValid(env: NodeJS.ProcessEnv = process.env): void {
  const problems: string[] = [];
  for (const resolve of RESOLVERS) {
    try {
      resolve(env);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (problems.length > 0) {
    throw new Error(`환경변수 설정 오류 ${problems.length}건:\n- ${problems.join('\n- ')}`);
  }
}
