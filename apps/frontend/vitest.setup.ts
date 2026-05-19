import '@testing-library/jest-dom/vitest';

/**
 * mediasoup 시나리오용 DOM polyfill.
 * - happy-dom v15 의 MediaStream / HTMLMediaElement.srcObject setter 는 자체
 *   타입 검증을 수행해 fake stream 을 거부한다. 본 setup 에서 MediaStream 을
 *   단순 polyfill 로 대체하고, srcObject setter 도 무검증 store/get 으로 override
 *   해 테스트가 ref callback 에서 임의 stream 을 attach 할 수 있게 한다.
 */
class MockMediaStream {
  private readonly tracks: MediaStreamTrack[];
  constructor(tracks?: MediaStreamTrack[]) {
    this.tracks = tracks ? [...tracks] : [];
  }
  getTracks(): MediaStreamTrack[] {
    return [...this.tracks];
  }
  getVideoTracks(): MediaStreamTrack[] {
    return this.tracks.filter((t) => t.kind === 'video');
  }
  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
  addTrack(track: MediaStreamTrack): void {
    this.tracks.push(track);
  }
  removeTrack(track: MediaStreamTrack): void {
    const idx = this.tracks.indexOf(track);
    if (idx !== -1) this.tracks.splice(idx, 1);
  }
}
(globalThis as unknown as { MediaStream: typeof MediaStream }).MediaStream =
  MockMediaStream as unknown as typeof MediaStream;

if (typeof HTMLMediaElement !== 'undefined') {
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
    configurable: true,
    get(): MediaStream | null {
      return (
        (this as unknown as { _srcObject?: MediaStream | null })._srcObject ?? null
      );
    },
    set(value: MediaStream | null): void {
      (this as unknown as { _srcObject: MediaStream | null })._srcObject = value;
    },
  });
}
