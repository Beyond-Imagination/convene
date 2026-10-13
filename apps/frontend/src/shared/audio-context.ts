let shared: AudioContext | null = null;

/** 음성 레벨 분석용 AudioContext 하나를 모든 타일이 나눠 쓴다. 지원하지 않는 환경이면 null. */
export function getSharedAudioContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (shared === null || shared.state === 'closed') shared = new AudioContext();
  // 사용자 제스처 전에 만들어지면 suspended로 시작한다. 입장까지 클릭이 있었으니 대개 바로 풀린다.
  if (shared.state === 'suspended') void shared.resume().catch(() => {});
  return shared;
}
