import { Injectable } from '@nestjs/common';

import { AudioBufferRepository } from '@/recording/domain/ports';

import { PCM_BYTES_PER_SECOND } from './audio-chunker';

const bytesToMs = (bytes: number): number =>
  Math.floor((bytes / PCM_BYTES_PER_SECOND) * 1000);

/**
 * AudioBufferRepository 의 in-memory 구현체.
 *
 * v1 부트스트랩 / 테스트용. 회의 1건 규모의 작은 버퍼만 다룬다는 가정으로
 * 모든 chunk 를 메모리에 누적하고, `consume` 시점에 한 번에 `Buffer.concat` 으로
 * 합쳐 돌려준 뒤 즉시 삭제한다(STT 후 즉시 폐기).
 */
@Injectable()
export class InMemoryAudioBufferRepository implements AudioBufferRepository {
  // meetingCode → (participantId → chunk list)
  private readonly store = new Map<string, Map<string, Buffer[]>>();
  // meetingCode → (participantId → 첫 markStarted 시 epoch ms)
  private readonly startedAts = new Map<string, Map<string, number>>();
  // meetingCode → (participantId → drainAvailable 으로 빠져나간 누적 byte)
  private readonly cursors = new Map<string, Map<string, number>>();

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

  async listActiveMeetings(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  async listActiveParticipants(meetingCode: string): Promise<string[]> {
    return Array.from(this.store.get(meetingCode)?.keys() ?? []);
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
    meetingCode: string,
    participantId: string,
    keepLastBytes: number,
  ): Promise<{ pcm: Buffer; startMs: number; startedAtMs?: number }> {
    const cursorsForMeeting = this.cursors.get(meetingCode);
    const cursorBefore = cursorsForMeeting?.get(participantId) ?? 0;
    const startedAtMs = this.startedAts.get(meetingCode)?.get(participantId);

    const perMeeting = this.store.get(meetingCode);
    const chunks = perMeeting?.get(participantId);
    const total = chunks ? Buffer.concat(chunks) : Buffer.alloc(0);
    if (total.length <= keepLastBytes) {
      return { pcm: Buffer.alloc(0), startMs: bytesToMs(cursorBefore), startedAtMs };
    }
    const drainLen = total.length - keepLastBytes;
    const drainedPcm = total.subarray(0, drainLen);
    const remaining = total.subarray(drainLen);

    // store 의 chunk list 를 remaining 단일 chunk 로 교체
    if (perMeeting) perMeeting.set(participantId, [Buffer.from(remaining)]);
    // cursor 갱신
    let cm = this.cursors.get(meetingCode);
    if (!cm) {
      cm = new Map();
      this.cursors.set(meetingCode, cm);
    }
    cm.set(participantId, cursorBefore + drainLen);

    return {
      pcm: Buffer.from(drainedPcm),
      startMs: bytesToMs(cursorBefore),
      startedAtMs,
    };
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
    const cursorsForMeeting = this.cursors.get(meetingCode);
    if (!perMeeting || perMeeting.size === 0) {
      this.store.delete(meetingCode);
      this.startedAts.delete(meetingCode);
      this.cursors.delete(meetingCode);
      return [];
    }
    const result: {
      participantId: string;
      audio: Buffer;
      startedAtMs?: number;
      startMs?: number;
    }[] = [];
    for (const [participantId, chunks] of perMeeting) {
      if (chunks.length === 0) continue;
      const startedAtMs = startedAtsForMeeting?.get(participantId);
      const cursorBytes = cursorsForMeeting?.get(participantId);
      result.push({
        participantId,
        audio: Buffer.concat(chunks),
        startedAtMs,
        startMs: cursorBytes !== undefined ? bytesToMs(cursorBytes) : undefined,
      });
    }
    this.store.delete(meetingCode);
    this.startedAts.delete(meetingCode);
    this.cursors.delete(meetingCode);
    return result;
  }
}
