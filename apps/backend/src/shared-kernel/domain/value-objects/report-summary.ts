/**
 * 회의 결과로 도출된 액션 아이템 한 건. LLM 요약 산출물의 일부.
 *
 * owner·due는 모델이 추출 못 하면 비어 있다.
 * due는 ISO 8601 또는 모델이 그대로 뱉는 자연어("이번 주 금요일" 등)일 수 있으므로 본 VO에서는 길이만 검증하고 포맷은 그대로 보존한다.
 */
export interface ActionItem {
  readonly owner?: string;
  readonly task: string;
  readonly due?: string;
}

const TASK_MAX = 500;
const OWNER_MAX = 50;
const DUE_MAX = 100;

export function actionItem(input: { owner?: string; task: string; due?: string }): ActionItem {
  const task = input.task.trim();
  if (task.length === 0 || task.length > TASK_MAX) {
    throw new Error(`ActionItem.task must be 1~${TASK_MAX} chars after trim`);
  }
  const result: { owner?: string; task: string; due?: string } = { task };
  if (input.owner !== undefined) {
    const owner = input.owner.trim();
    if (owner.length === 0 || owner.length > OWNER_MAX) {
      throw new Error(`ActionItem.owner must be 1~${OWNER_MAX} chars after trim`);
    }
    result.owner = owner;
  }
  if (input.due !== undefined) {
    const due = input.due.trim();
    if (due.length === 0 || due.length > DUE_MAX) {
      throw new Error(`ActionItem.due must be 1~${DUE_MAX} chars after trim`);
    }
    result.due = due;
  }
  return result;
}

/**
 * 회의 중 다뤄진 핵심 주제 한 건과 그 안의 핵심 포인트들. LLM 요약 산출물.
 */
export interface KeyTopic {
  readonly topic: string;
  readonly points: ReadonlyArray<string>;
}

const TOPIC_MAX = 200;
const POINT_MAX = 500;
const POINTS_MAX_COUNT = 20;

export function keyTopic(input: { topic: string; points: string[] }): KeyTopic {
  const topic = input.topic.trim();
  if (topic.length === 0 || topic.length > TOPIC_MAX) {
    throw new Error(`KeyTopic.topic must be 1~${TOPIC_MAX} chars after trim`);
  }
  if (input.points.length === 0 || input.points.length > POINTS_MAX_COUNT) {
    throw new Error(`KeyTopic.points must contain 1~${POINTS_MAX_COUNT} items`);
  }
  const points = input.points.map((p, i) => {
    const trimmed = p.trim();
    if (trimmed.length === 0 || trimmed.length > POINT_MAX) {
      throw new Error(`KeyTopic.points[${i}] must be 1~${POINT_MAX} chars after trim`);
    }
    return trimmed;
  });
  return { topic, points };
}

/**
 * 회의 종료 후 LLM이 산출하는 "회사 회의록" 형태의 정제된 요약.
 *
 * Plain transcript/timeline이 아니라 의사결정·액션·핵심 토픽으로 구조화된 결과.
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
