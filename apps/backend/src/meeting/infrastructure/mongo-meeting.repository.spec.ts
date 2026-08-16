import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, createConnection } from 'mongoose';

import { Meeting } from '@/meeting/domain/meeting';
import { IdleTimeout } from '@/meeting/domain/value-objects/idle-timeout';
import { MeetingCode } from '@/meeting/domain/value-objects/meeting-code';
import { externalReference } from '@/shared-kernel/domain/value-objects/external-reference';

import { MongoMeetingRepository } from './mongo-meeting.repository';

jest.setTimeout(60_000);

const t0 = new Date('2026-01-01T00:00:00Z');
const t1m = new Date('2026-01-01T00:01:00Z');

const makeMeeting = (codeStr: string): Meeting =>
  Meeting.create({
    code: MeetingCode.from(codeStr),
    source: 'web',
    externalReference: externalReference(),
    idleTimeout: IdleTimeout.default(),
    startedAt: t0,
    hostToken: `host-${codeStr}`,
    title: null,
  });

const makeScheduled = (codeStr: string): Meeting =>
  Meeting.createScheduled({
    code: MeetingCode.from(codeStr),
    source: 'notion-issue',
    externalReference: externalReference(),
    idleTimeout: IdleTimeout.default(),
    createdAt: t0,
    hostToken: `host-${codeStr}`,
    title: '주간 회의',
  });

describe('MongoMeetingRepository', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;
  let repo: MongoMeetingRepository;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    connection = createConnection(mongod.getUri(), { dbName: 'test-meetings' });
    await connection.asPromise();
  });

  afterAll(async () => {
    await connection.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    if (connection.db) {
      await connection.db.dropDatabase();
    }
    repo = new MongoMeetingRepository(connection);
  });

  it('등록되지 않은 code는 null을 돌려준다', async () => {
    expect(await repo.findByCode('missing0')).toBeNull();
  });

  it('save 후 findByCode는 동일한 snapshot의 Meeting을 돌려준다', async () => {
    const meeting = makeMeeting('abc12xyz');
    meeting.addParticipant('socket-a', '가', t0);
    await repo.save(meeting);

    const found = await repo.findByCode('abc12xyz');

    expect(found).not.toBeNull();
    expect(found!.snapshot()).toEqual(meeting.snapshot());
  });

  it('연결 정보(connectionId·끊김 시각)가 round-trip 된다 — 재시작 후에도 재접속으로 붙어야 한다', async () => {
    const meeting = makeMeeting('abc12xyz');
    meeting.addParticipant('p-1', '가', t0, 'socket-a');
    meeting.disconnectParticipant('socket-a', t0);
    await repo.save(meeting);

    const found = await repo.findByCode('abc12xyz');

    expect(found!.findByConnectionId('socket-a')?.id).toBe('p-1');
    expect(found!.findParticipant('p-1')?.isDisconnected).toBe(true);
  });

  it('같은 code를 다시 save 하면 덮어쓴다', async () => {
    const meeting = makeMeeting('abc12xyz');
    await repo.save(meeting);
    meeting.addParticipant('socket-a', '가', t1m);
    await repo.save(meeting);

    const found = await repo.findByCode('abc12xyz');

    expect(found!.activeParticipantCount).toBe(1);
  });

  it('예약 회의도 그대로 복원한다', async () => {
    const meeting = makeScheduled('sched123');
    await repo.save(meeting);

    const found = await repo.findByCode('sched123');

    expect(found!.snapshot()).toEqual(meeting.snapshot());
  });

  it('listOpenCodes는 진행 중인 회의 code만 돌려준다', async () => {
    const open = makeMeeting('open1234');
    const closed = makeMeeting('closd123');
    closed.close(t1m);
    const scheduled = makeScheduled('sched123');
    await repo.save(open);
    await repo.save(closed);
    await repo.save(scheduled);

    expect(await repo.listOpenCodes()).toEqual(['open1234']);
  });

  it('종료된 회의도 findByCode로 계속 조회된다', async () => {
    const meeting = makeMeeting('closd123');
    meeting.close(t1m);
    await repo.save(meeting);

    const found = await repo.findByCode('closd123');

    expect(found!.status).toBe('closed');
    expect(found!.endedAt).toEqual(t1m);
  });
});
