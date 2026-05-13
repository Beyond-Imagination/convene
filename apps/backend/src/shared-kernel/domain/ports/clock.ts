/**
 * 시간 의존성 추상화. `Date.now()` 같은 사이드 이펙트를 도메인·애플리케이션
 * 레이어 밖으로 격리해 테스트에서 결정론적으로 다룬다.
 *
 * 구현체는 infrastructure layer가 주입한다(예: 실제 `SystemClock`,
 * 테스트용 `FakeClock`).
 */
export interface Clock {
  now(): Date;
}
