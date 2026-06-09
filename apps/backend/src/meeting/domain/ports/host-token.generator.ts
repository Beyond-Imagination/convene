/**
 * 회의 종료 권한자(host) 식별용 비밀 토큰 발급 추상화.
 *
 * 회의 생성 시 1회 발급해 생성자에게만 전달한다.
 * socket id와 달리 새로고침/재접속해도 유지되어, 토큰 보유자만 회의를 종료할 수 있다.
 */
export interface HostTokenGenerator {
  next(): string;
}
