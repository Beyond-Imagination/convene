import { Injectable } from '@nestjs/common';

import { AudioBufferRepository } from '@/recording/domain/ports';

/**
 * AudioBufferRepository 의 in-memory 구현체.
 *
 * v1 부트스트랩 / 테스트용. 회의 1건 규모의 작은 버퍼만 다룬다는 가정으로
 * 모든 chunk 를 메모리에 누적하고, `consume` 시점에 한 번에 `Buffer.concat` 으로
 * 합쳐 돌려준 뒤 즉시 삭제한다(PLAN.md §3 — STT 후 즉시 폐기).
 */
@Injectable()
export class InMemoryAudioBufferRepository implements AudioBufferRepository {
  // meetingCode → (participantId → chunk list)
  private readonly store = new Map<string, Map<string, Buffer[]>>();
  // meetingCode → (participantId → 첫 markStarted 시 epoch ms)
  private readonly startedAts = new Map<string, Map<string, number>>();

  async append(meetingCode: string, participantId: string, chunk: Buffer): Promise<void> {
    let perMeeting = this.store.get(meetingCode);
    if (!perMeeting) {
      perMeeting = new Map();
      this.store.set(meetingCode, perMeeting);
    }
    const existing = perMeeting.get(participantId);
    if (existing) {
      existing.push(chunk);
    } else {
      perMeeting.set(participantId, [chunk]);
    }
  }

  async markStarted(
    meetingCode: string,
    participantId: string,
    startedAtMs: number,
  ): Promise<void> {
    let perMeeting = this.startedAts.get(meetingCode);
    if (!perMeeting) {
      perMeeting = new Map();
      this.startedAts.set(meetingCode, perMeeting);
    }
    // SETNX 의미 — 첫 호출만 기록한다. 동일 (code, pid) 의 두 번째 호출은 무시.
    if (!perMeeting.has(participantId)) {
      perMeeting.set(participantId, startedAtMs);
    }
  }

  async drainAvailable(
    _meetingCode: string,
    _participantId: string,
    _keepLastBytes: number,
  ): Promise<{ pcm: Buffer; startMs: number; startedAtMs?: number }> {
    throw new Error('not implemented');
  }

  async consume(
    meetingCode: string,
  ): Promise<
    ReadonlyArray<{
      participantId: string;
      audio: Buffer;
      startedAtMs?: number;
      startMs?: number;
    }>
  > {
    const perMeeting = this.store.get(meetingCode);
    const startedAtsForMeeting = this.startedAts.get(meetingCode);
    if (!perMeeting || perMeeting.size === 0) {
      this.store.delete(meetingCode);
      this.startedAts.delete(meetingCode);
      return [];
    }
    const result: { participantId: string; audio: Buffer; startedAtMs?: number }[] = [];
    for (const [participantId, chunks] of perMeeting) {
      if (chunks.length === 0) continue;
      const startedAtMs = startedAtsForMeeting?.get(participantId);
      result.push({ participantId, audio: Buffer.concat(chunks), startedAtMs });
    }
    this.store.delete(meetingCode);
    this.startedAts.delete(meetingCode);
    return result;
  }
}
