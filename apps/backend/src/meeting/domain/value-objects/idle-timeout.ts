/**
 * 마지막 참가자가 나간 뒤 회의가 자동 종료될 때까지의 idle 시간.
 *
 * v1.0.0 디폴트는 10분이며 **회의 자체의 hard time limit은 없다**.
 * 회의는 (a) idle 윈도우가 경과하거나 (b) 명시적으로 종료될 때에만 닫힌다.
 *
 * PLAN.md §2("hard limit 없음 + idle 10분") / ARCHITECTURE.md §2.1 참조.
 */
export class IdleTimeout {
  static readonly DEFAULT_MS = 10 * 60 * 1000;

  private constructor(public readonly milliseconds: number) {}

  static of(ms: number): IdleTimeout {
    if (!Number.isFinite(ms) || !Number.isInteger(ms) || ms <= 0) {
      throw new Error(`IdleTimeout must be a positive integer ms, got ${ms}`);
    }
    return new IdleTimeout(ms);
  }

  static default(): IdleTimeout {
    return IdleTimeout.of(IdleTimeout.DEFAULT_MS);
  }

  equals(other: IdleTimeout): boolean {
    return this.milliseconds === other.milliseconds;
  }
}
