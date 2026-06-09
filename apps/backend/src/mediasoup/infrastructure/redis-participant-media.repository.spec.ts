import type Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

import { ParticipantMedia } from '@/mediasoup/domain/participant-media';

import { RedisParticipantMediaRepository } from './redis-participant-media.repository';

const spawn = (participantId: string, meetingCode: string, routerIndex = 0) =>
  ParticipantMedia.spawn({ participantId, meetingCode, routerIndex });

describe('RedisParticipantMediaRepository', () => {
  let redis: Redis;
  let repo: RedisParticipantMediaRepository;

  beforeEach(() => {
    redis = new RedisMock() as unknown as Redis;
    repo = new RedisParticipantMediaRepository(redis);
  });

  afterEach(async () => {
    await redis.flushall();
    await redis.quit();
  });

  it('등록되지 않은 participantId는 null을 돌려준다', async () => {
    expect(await repo.findByParticipantId('unknown')).toBeNull();
  });

  it('save 후 findByParticipantId는 동일한 snapshot의 ParticipantMedia를 돌려준다', async () => {
    const pm = spawn('s1', 'ABCDEFGH');
    pm.attachTransport('send', 't-send');
    pm.addProducer('p1', { kind: 'audio', source: 'audio' });
    await repo.save(pm);

    const found = await repo.findByParticipantId('s1');
    expect(found).not.toBeNull();
    expect(found!.snapshot()).toEqual(pm.snapshot());
  });

  it('같은 participantId로 두 번 save 하면 마지막 상태로 덮어쓴다', async () => {
    const a = spawn('s1', 'ABCDEFGH', 0);
    await repo.save(a);
    const b = spawn('s1', 'ABCDEFGH', 1);
    await repo.save(b);

    const found = await repo.findByParticipantId('s1');
    expect(found!.routerIndex).toBe(1);
  });

  it('findByMeetingCode는 같은 meetingCode의 ParticipantMedia 들을 그룹으로 돌려준다', async () => {
    await repo.save(spawn('s1', 'CODE1111'));
    await repo.save(spawn('s2', 'CODE1111'));
    await repo.save(spawn('s3', 'CODE2222'));

    const found = await repo.findByMeetingCode('CODE1111');
    expect(found).toHaveLength(2);
    expect(new Set(found.map((m) => m.participantId))).toEqual(new Set(['s1', 's2']));
  });

  it('findByMeetingCode는 등록된 회의가 없으면 빈 배열을 돌려준다', async () => {
    expect(await repo.findByMeetingCode('NOPE0000')).toEqual([]);
  });

  it('removeByParticipantId 후엔 단건 조회와 그룹 조회 모두에서 사라진다', async () => {
    await repo.save(spawn('s1', 'CODE1111'));
    await repo.save(spawn('s2', 'CODE1111'));
    await repo.removeByParticipantId('s1');

    expect(await repo.findByParticipantId('s1')).toBeNull();
    const found = await repo.findByMeetingCode('CODE1111');
    expect(found).toHaveLength(1);
    expect(found[0].participantId).toBe('s2');
  });

  it('removeByParticipantId는 존재하지 않는 pid에도 throw 하지 않는다(멱등)', async () => {
    await expect(repo.removeByParticipantId('ghost')).resolves.toBeUndefined();
  });

  it('removeAllByMeetingCode는 해당 회의의 ParticipantMedia만 모두 제거한다', async () => {
    await repo.save(spawn('s1', 'CODE1111'));
    await repo.save(spawn('s2', 'CODE1111'));
    await repo.save(spawn('s3', 'CODE2222'));

    await repo.removeAllByMeetingCode('CODE1111');

    expect(await repo.findByMeetingCode('CODE1111')).toEqual([]);
    expect(await repo.findByParticipantId('s1')).toBeNull();
    expect(await repo.findByParticipantId('s2')).toBeNull();
    const remain = await repo.findByMeetingCode('CODE2222');
    expect(remain).toHaveLength(1);
    expect(remain[0].participantId).toBe('s3');
  });

  it('removeAllByMeetingCode는 비어있는 회의에도 throw 하지 않는다(멱등)', async () => {
    await expect(repo.removeAllByMeetingCode('NOPE0000')).resolves.toBeUndefined();
  });

  it('closed 상태와 producer/consumer 목록도 round-trip 된다', async () => {
    const pm = spawn('s1', 'CODE1111');
    pm.attachTransport('send', 't-send');
    pm.attachTransport('recv', 't-recv');
    pm.addProducer('p1', { kind: 'audio', source: 'audio' });
    pm.addConsumer('c1', { producerId: 'p-other', kind: 'video', source: 'video' });
    pm.close();
    await repo.save(pm);

    const found = await repo.findByParticipantId('s1');
    expect(found!.isClosed).toBe(true);
    expect(found!.producers).toEqual([{ id: 'p1', kind: 'audio', source: 'audio', paused: false }]);
    expect(found!.consumers).toEqual([
      { id: 'c1', producerId: 'p-other', kind: 'video', source: 'video' },
    ]);
  });
});
