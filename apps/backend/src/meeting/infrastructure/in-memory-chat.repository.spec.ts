import { chatEntry } from '@/shared-kernel/domain/value-objects';

import { InMemoryChatRepository } from './in-memory-chat.repository';

const t0 = new Date('2026-01-01T00:00:00Z');
const t1 = new Date('2026-01-01T00:00:01Z');
const t2 = new Date('2026-01-01T00:00:02Z');

describe('InMemoryChatRepository', () => {
  it('등록되지 않은 code는 빈 배열을 돌려준다', async () => {
    const repo = new InMemoryChatRepository();
    expect(await repo.listByCode('abc12xyz')).toEqual([]);
  });

  it('append 후 listByCode가 같은 entry를 시간순으로 돌려준다', async () => {
    const repo = new InMemoryChatRepository();
    const e1 = chatEntry({ nickname: 'alice', text: 'hi', sentAt: t0 });
    const e2 = chatEntry({ nickname: 'bob', text: 'hello', sentAt: t1 });
    await repo.append('abc12xyz', e1);
    await repo.append('abc12xyz', e2);
    const list = await repo.listByCode('abc12xyz');
    expect(list).toEqual([e1, e2]);
  });

  it('서로 다른 code의 채팅은 격리된다', async () => {
    const repo = new InMemoryChatRepository();
    const e1 = chatEntry({ nickname: 'alice', text: 'hi', sentAt: t0 });
    const e2 = chatEntry({ nickname: 'bob', text: 'hello', sentAt: t1 });
    await repo.append('abc12xyz', e1);
    await repo.append('xyz99aaa', e2);
    expect(await repo.listByCode('abc12xyz')).toEqual([e1]);
    expect(await repo.listByCode('xyz99aaa')).toEqual([e2]);
  });

  it('listByCode는 내부 배열의 사본이라 외부에서 mutate해도 저장소에 반영되지 않는다', async () => {
    const repo = new InMemoryChatRepository();
    const e1 = chatEntry({ nickname: 'alice', text: 'hi', sentAt: t0 });
    await repo.append('abc12xyz', e1);
    const list = await repo.listByCode('abc12xyz');
    list.push(chatEntry({ nickname: 'evil', text: 'inject', sentAt: t2 }));
    expect(await repo.listByCode('abc12xyz')).toEqual([e1]);
  });
});
