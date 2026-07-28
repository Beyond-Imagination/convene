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
