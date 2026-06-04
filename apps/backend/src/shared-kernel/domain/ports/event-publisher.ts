import type { DomainEventName } from '@convene/shared-interfaces';

/**
 * 도메인 이벤트 발행 포트. Application Service가 본 인터페이스에만 의존하며,
 * 구현체(예: `@nestjs/event-emitter` 기반 어댑터)는 Infrastructure layer에서
 * 주입한다.
 *
 * 도메인 이벤트 발행 책임은 Application layer에 있고, 프레임워크 의존성은 Port로
 * 격리한다.
 *
 * `payload` 타입은 컨텍스트별로 자유롭게 정의되도록 `unknown` 으로 둔다.
 */
/**
 * publish 는 **async listener 의 완료까지 await** 한다. nest-event-bus 어댑터는
 * `emitter.emitAsync` 를 사용해 모든 listener 의 Promise 를 Promise.all 로 묶는다.
 *
 * 왜 async 가 필요한가:
 *   - cross-BC lifecycle listener (예: meeting.participant.joined → mediasoup.admitParticipant)
 *     가 fire-and-forget 으로 호출되면 caller(joinMeeting → handleJoin → ack 응답)가
 *     return 한 시점에 admit 이 아직 안 끝난 race 가 발생. 곧이은 CREATE_TRANSPORT /
 *     PRODUCE RPC 가 ParticipantMediaNotFoundError 로 fail 한다.
 *   - publish 호출이 끝났을 때 **모든 listener 의 동기/비동기 작업도 완료** 되어야
 *     동등 동작이 보장된다.
 */
export interface DomainEventPublisher {
  publish(name: DomainEventName, payload: unknown): Promise<void>;
}
