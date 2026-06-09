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
