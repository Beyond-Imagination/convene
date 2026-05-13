import type { DomainEventName } from '@migration/shared-interfaces';

/**
 * 도메인 이벤트 발행 포트. Application Service가 본 인터페이스에만 의존하며,
 * 구현체(예: `@nestjs/event-emitter` 기반 어댑터)는 Infrastructure layer에서
 * 주입한다.
 *
 * ARCHITECTURE.md §2.4 / §3 — 도메인 이벤트 발행 책임은 Application layer에 있고,
 * 프레임워크 의존성은 Port로 격리한다.
 *
 * `payload` 타입은 v1 단계에선 컨텍스트별로 자유롭게 정의되며, shared 페이로드
 * 인터페이스가 굳어지는 시점에 제네릭으로 좁힐 예정이다.
 */
export interface DomainEventPublisher {
  publish(name: DomainEventName, payload: unknown): void;
}
