import { BadRequestException } from '@nestjs/common';

import { MeetingNotFoundError, NotHostError } from '@/meeting/application/meeting.errors';
import { Meeting } from '@/meeting/domain/meeting';
import { IdleTimeout, MeetingCode } from '@/meeting/domain/value-objects';
import { CreateMeetingDto } from '@/meeting/interface/dto/create-meeting.dto';
import { ExternalReferenceDto } from '@/meeting/interface/dto/external-reference.dto';
import { externalReference } from '@/shared-kernel/domain/value-objects';

import { MeetingController } from './meeting.controller';

const fakeCode = MeetingCode.from('abc12xyz');
const fakeStartedAt = new Date('2026-01-01T00:00:00.000Z');

const fakeMeeting = () =>
  Meeting.create({
    code: fakeCode,
    source: 'web',
    externalReference: externalReference(),
    idleTimeout: IdleTimeout.default(),
    startedAt: fakeStartedAt,
    hostToken: 'host-token-1',
    title: null,
  });

interface ServiceCall {
  source: string;
  externalReference: { issueId?: string };
}

const makeController = () => {
  const calls: ServiceCall[] = [];
  const service = {
    createMeeting: jest.fn(async (cmd: ServiceCall) => {
      calls.push(cmd);
      return fakeMeeting();
    }),
  };

  const controller = new MeetingController(service as any);
  return { controller, service, calls };
};

const dtoOf = (source: 'web' | 'notion-issue', issueId?: string): CreateMeetingDto => {
  const dto = new CreateMeetingDto();
  dto.source = source;
  if (issueId !== undefined) {
    const ext = new ExternalReferenceDto();
    ext.issueId = issueId;
    dto.externalReference = ext;
  }
  return dto;
};

describe('MeetingController.createMeeting', () => {
  it('externalReference 미전송 시 NO_EXTERNAL_REFERENCE로 service.createMeeting을 호출한다', async () => {
    const { controller, service, calls } = makeController();
    await controller.createMeeting(dtoOf('web'));
    expect(service.createMeeting).toHaveBeenCalledTimes(1);
    expect(calls[0].source).toBe('web');
    expect(calls[0].externalReference).toEqual({});
  });

  it('externalReference.issueId가 있으면 ExternalReference VO로 변환해 전달한다', async () => {
    const { controller, calls } = makeController();
    await controller.createMeeting(dtoOf('notion-issue', 'NTN-1'));
    expect(calls[0].source).toBe('notion-issue');
    expect(calls[0].externalReference).toEqual({ issueId: 'NTN-1' });
  });

  it('응답은 CreateMeetingResponse 형식(code/source/startedAt ISO/hostToken)으로 직렬화된다', async () => {
    const { controller } = makeController();
    const result = await controller.createMeeting(dtoOf('web'));
    expect(result).toEqual({
      code: 'abc12xyz',
      source: 'web',
      startedAt: '2026-01-01T00:00:00.000Z',
      hostToken: 'host-token-1',
    });
  });
});

describe('MeetingController.getMeeting', () => {
  const makeScheduled = () =>
    Meeting.createScheduled({
      code: fakeCode,
      source: 'notion-issue',
      externalReference: externalReference({ issueId: 'NTN-1' }),
      idleTimeout: IdleTimeout.default(),
      createdAt: fakeStartedAt,
      hostToken: 'host-token-1',
      title: '스프린트 회고',
    });

  const makeController = (meeting: Meeting) => {
    const service = { getMeeting: jest.fn(async () => meeting) };
    return { controller: new MeetingController(service as any), service };
  };

  it('예약 회의는 아직 열리지 않았으므로 startedAt이 null이다', async () => {
    const { controller } = makeController(makeScheduled());
    await expect(controller.getMeeting('abc12xyz')).resolves.toEqual({
      code: 'abc12xyz',
      title: '스프린트 회고',
      status: 'scheduled',
      participantCount: 0,
      startedAt: null,
      endedAt: null,
    });
  });

  it('첫 입장으로 열린 회의는 참가자 수와 열린 시각을 싣는다', async () => {
    const opened = makeScheduled();
    const joinedAt = new Date('2026-01-01T01:00:00.000Z');
    opened.addParticipant('s1', 'alice', joinedAt);
    const { controller } = makeController(opened);

    const result = await controller.getMeeting('abc12xyz');
    expect(result.status).toBe('open');
    expect(result.participantCount).toBe(1);
    expect(result.startedAt).toBe(joinedAt.toISOString());
  });

  it('종료된 회의는 status=closed와 endedAt을 싣는다', async () => {
    const closed = makeScheduled();
    closed.addParticipant('s1', 'alice', fakeStartedAt);
    const endedAt = new Date('2026-01-01T02:00:00.000Z');
    closed.close(endedAt);
    const { controller } = makeController(closed);

    const result = await controller.getMeeting('abc12xyz');
    expect(result.status).toBe('closed');
    expect(result.endedAt).toBe(endedAt.toISOString());
  });

  it('잘못된 code 형식은 BadRequestException으로 거부하고 service를 호출하지 않는다', async () => {
    const { controller, service } = makeController(makeScheduled());
    await expect(controller.getMeeting('BAD')).rejects.toBeInstanceOf(BadRequestException);
    expect(service.getMeeting).not.toHaveBeenCalled();
  });

  it('service가 던진 MeetingNotFoundError를 그대로 전파한다', async () => {
    const service = {
      getMeeting: jest.fn(async () => {
        throw new MeetingNotFoundError('abc12xyz');
      }),
    };
    const controller = new MeetingController(service as any);
    await expect(controller.getMeeting('abc12xyz')).rejects.toBeInstanceOf(MeetingNotFoundError);
  });
});

describe('MeetingController.closeMeeting', () => {
  const endedAt = new Date('2026-01-01T00:30:00.000Z');

  const makeClosed = () => {
    const m = Meeting.create({
      code: fakeCode,
      source: 'web',
      externalReference: externalReference(),
      idleTimeout: IdleTimeout.default(),
      startedAt: fakeStartedAt,
      hostToken: 'host-token-1',
      title: null,
    });
    m.close(endedAt);
    return m;
  };

  const makeController = () => {
    const calls: Array<{ code: string; reason: string; hostToken: string }> = [];
    const service = {
      closeMeeting: jest.fn(async (cmd: { code: string; reason: string; hostToken: string }) => {
        calls.push(cmd);
        return makeClosed();
      }),
    };

    const controller = new MeetingController(service as any);
    return { controller, service, calls };
  };

  it('service.closeMeeting을 code + reason="manual" + 전달받은 hostToken으로 호출한다', async () => {
    const { controller, calls } = makeController();
    await controller.closeMeeting('abc12xyz', 'host-token-1');
    expect(calls).toEqual([{ code: 'abc12xyz', reason: 'manual', hostToken: 'host-token-1' }]);
  });

  it('hostToken 헤더가 없으면 빈 문자열로 위임한다(서버가 host 아님으로 거부)', async () => {
    const { controller, calls } = makeController();
    await controller.closeMeeting('abc12xyz');
    expect(calls).toEqual([{ code: 'abc12xyz', reason: 'manual', hostToken: '' }]);
  });

  it('응답은 CloseMeetingResponse 형식(code/endedAt ISO)으로 직렬화된다', async () => {
    const { controller } = makeController();
    const result = await controller.closeMeeting('abc12xyz', 'host-token-1');
    expect(result).toEqual({
      code: 'abc12xyz',
      endedAt: '2026-01-01T00:30:00.000Z',
    });
  });

  it('service가 던진 NotHostError를 그대로 전파한다(HTTP 매핑은 DomainExceptionFilter 담당)', async () => {
    const service = {
      closeMeeting: jest.fn(async () => {
        throw new NotHostError('abc12xyz');
      }),
    };

    const controller = new MeetingController(service as any);
    await expect(controller.closeMeeting('abc12xyz', 'wrong')).rejects.toBeInstanceOf(NotHostError);
  });

  it('잘못된 code 형식(대문자·길이 등)은 BadRequestException으로 거부하고 service를 호출하지 않는다', async () => {
    const { controller, service } = makeController();
    await expect(controller.closeMeeting('BAD')).rejects.toBeInstanceOf(BadRequestException);
    expect(service.closeMeeting).not.toHaveBeenCalled();
  });

  it('service가 던진 MeetingNotFoundError를 그대로 전파한다', async () => {
    const service = {
      closeMeeting: jest.fn(async () => {
        throw new MeetingNotFoundError('abc12xyz');
      }),
    };

    const controller = new MeetingController(service as any);
    await expect(controller.closeMeeting('abc12xyz')).rejects.toBeInstanceOf(MeetingNotFoundError);
  });

  it('service의 기타 도메인 에러는 그대로 전파된다(NotFoundException으로 감싸지 않음)', async () => {
    const service = {
      closeMeeting: jest.fn(async () => {
        throw new Error('Meeting is already closed');
      }),
    };

    const controller = new MeetingController(service as any);
    await expect(controller.closeMeeting('abc12xyz')).rejects.toThrow(/already closed/);
  });
});
