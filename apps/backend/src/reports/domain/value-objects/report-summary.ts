import { ActionItem, actionItem } from './action-item';
import { KeyTopic, keyTopic } from './key-topic';

/**
 * 회의 종료 후 LLM이 산출하는 "회사 회의록" 형태의 정제된 요약.
 *
 * Plain transcript/timeline이 아니라 의사결정·액션·핵심 토픽으로 구조화된 결과.
 * 본 VO 자체는 형식 검증만 책임지며, 모델 호출과 실패 처리는 Application
 * Service가 `SummarizerPort`를 통해 수행한다.
 */
export interface ReportSummary {
  readonly title: string;
  readonly overview: string;
  readonly decisions: ReadonlyArray<string>;
  readonly actionItems: ReadonlyArray<ActionItem>;
  readonly keyTopics: ReadonlyArray<KeyTopic>;
}

const TITLE_MAX = 200;
const OVERVIEW_MAX = 1000;
const DECISION_MAX = 500;
const DECISIONS_MAX_COUNT = 50;
const ACTION_ITEMS_MAX_COUNT = 50;
const KEY_TOPICS_MAX_COUNT = 20;

export function reportSummary(input: {
  title: string;
  overview: string;
  decisions: string[];
  actionItems: Array<{ owner?: string; task: string; due?: string }>;
  keyTopics: Array<{ topic: string; points: string[] }>;
}): ReportSummary {
  const title = input.title.trim();
  if (title.length === 0 || title.length > TITLE_MAX) {
    throw new Error(`ReportSummary.title must be 1~${TITLE_MAX} chars after trim`);
  }
  const overview = input.overview.trim();
  if (overview.length === 0 || overview.length > OVERVIEW_MAX) {
    throw new Error(`ReportSummary.overview must be 1~${OVERVIEW_MAX} chars after trim`);
  }
  if (input.decisions.length > DECISIONS_MAX_COUNT) {
    throw new Error(`ReportSummary.decisions must contain at most ${DECISIONS_MAX_COUNT} items`);
  }
  const decisions = input.decisions.map((d, i) => {
    const trimmed = d.trim();
    if (trimmed.length === 0 || trimmed.length > DECISION_MAX) {
      throw new Error(`ReportSummary.decisions[${i}] must be 1~${DECISION_MAX} chars after trim`);
    }
    return trimmed;
  });
  if (input.actionItems.length > ACTION_ITEMS_MAX_COUNT) {
    throw new Error(
      `ReportSummary.actionItems must contain at most ${ACTION_ITEMS_MAX_COUNT} items`,
    );
  }
  const actionItems = input.actionItems.map((a) => actionItem(a));
  if (input.keyTopics.length > KEY_TOPICS_MAX_COUNT) {
    throw new Error(`ReportSummary.keyTopics must contain at most ${KEY_TOPICS_MAX_COUNT} items`);
  }
  const keyTopics = input.keyTopics.map((t) => keyTopic(t));
  return { title, overview, decisions, actionItems, keyTopics };
}
