import type { DomainEventName } from '@convene/shared-interfaces';

/**
 * 도메인 이벤트 발행 포트.
 *
 * `payload` 타입은 컨텍스트별로 자유롭게 정의되도록 `unknown`으로 둔다.
 */
export interface DomainEventPublisher {
  publish(name: DomainEventName, payload: unknown): Promise<void>;
}
