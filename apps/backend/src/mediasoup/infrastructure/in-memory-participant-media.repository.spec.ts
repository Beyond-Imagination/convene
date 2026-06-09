import { ParticipantMedia } from '@/mediasoup/domain/participant-media';

import { InMemoryParticipantMediaRepository } from './in-memory-participant-media.repository';

const spawn = (participantId: string, meetingCode: string, routerIndex = 0) =>
  ParticipantMedia.spawn({ participantId, meetingCode, routerIndex });

describe('InMemoryParticipantMediaRepository', () => {
  it('save한 ParticipantMedia를 같은 participantId로 findByParticipantId 했을 때 동일 인스턴스를 돌려준다', async () => {
    const repo = new InMemoryParticipantMediaRepository();
    const pm = spawn('s1', 'ABCDEFGH');
    await repo.save(pm);
    const found = await repo.findByParticipantId('s1');
    expect(found).toBe(pm);
  });

  it('등록되지 않은 participantId는 null을 돌려준다', async () => {
    const repo = new InMemoryParticipantMediaRepository();
    expect(await repo.findByParticipantId('unknown')).toBeNull();
  });

  it('같은 participantId로 다시 save하면 마지막 인스턴스로 덮어쓴다', async () => {
    const repo = new InMemoryParticipantMediaRepository();
    const a = spawn('s1', 'ABCDEFGH', 0);
    const b = spawn('s1', 'ABCDEFGH', 1);
    await repo.save(a);
    await repo.save(b);
    expect(await repo.findByParticipantId('s1')).toBe(b);
  });

  it('findByMeetingCode는 같은 meetingCode의 ParticipantMedia만 그룹으로 돌려준다', async () => {
    const repo = new InMemoryParticipantMediaRepository();
    const a = spawn('s1', 'CODE1111');
    const b = spawn('s2', 'CODE1111');
    const c = spawn('s3', 'CODE2222');
    await repo.save(a);
    await repo.save(b);
    await repo.save(c);
    const found = await repo.findByMeetingCode('CODE1111');
    expect(found).toHaveLength(2);
    expect(new Set(found)).toEqual(new Set([a, b]));
  });

  it('removeByParticipantId 후엔 null을 돌려준다', async () => {
    const repo = new InMemoryParticipantMediaRepository();
    await repo.save(spawn('s1', 'ABCDEFGH'));
    await repo.removeByParticipantId('s1');
    expect(await repo.findByParticipantId('s1')).toBeNull();
  });

  it('removeAllByMeetingCode는 해당 회의의 ParticipantMedia만 모두 제거한다', async () => {
    const repo = new InMemoryParticipantMediaRepository();
    await repo.save(spawn('s1', 'CODE1111'));
    await repo.save(spawn('s2', 'CODE1111'));
    await repo.save(spawn('s3', 'CODE2222'));
    await repo.removeAllByMeetingCode('CODE1111');
    expect(await repo.findByMeetingCode('CODE1111')).toEqual([]);
    expect(await repo.findByMeetingCode('CODE2222')).toHaveLength(1);
  });
});
