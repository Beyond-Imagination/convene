import { Injectable } from '@nestjs/common';

import { AudioBufferRepository } from '@/recording/domain/ports';

/**
 * AudioBufferRepository 의 in-memory 구현체.
 *
 * v1 부트스트랩 / 테스트용. 회의 1건 규모의 작은 버퍼만 다룬다는 가정으로
 * 모든 chunk 를 메모리에 누적하고, `consume` 시점에 한 번에 `Buffer.concat` 으로
 * 합쳐 돌려준 뒤 즉시 삭제한다(PLAN.md §3 — STT 후 즉시 폐기).
 *
 * 운영 환경에서는 백엔드 임시 디스크 기반 구현체로 교체될 자리이다.
 */
@Injectable()
export class InMemoryAudioBufferRepository implements AudioBufferRepository {
  private readonly store = new Map<string, Buffer[]>();

  async append(meetingCode: string, chunk: Buffer): Promise<void> {
    const existing = this.store.get(meetingCode);
    if (existing) {
      existing.push(chunk);
    } else {
      this.store.set(meetingCode, [chunk]);
    }
  }

  async consume(meetingCode: string): Promise<Buffer | null> {
    const chunks = this.store.get(meetingCode);
    if (!chunks || chunks.length === 0) {
      this.store.delete(meetingCode);
      return null;
    }
    this.store.delete(meetingCode);
    return Buffer.concat(chunks);
  }
}
