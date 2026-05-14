import { BadRequestException, NotFoundException } from '@nestjs/common';

import { MeetingNotFoundError } from '@/meeting/application/meeting.errors';
import { Meeting } from '@/meeting/domain/meeting';
import { IdleTimeout, MeetingCode } from '@/meeting/domain/value-objects';
import { externalReference } from '@/shared-kernel/domain/value-objects';

import { CreateMeetingDto } from '@/meeting/interface/dto/create-meeting.dto';
import { ExternalReferenceDto } from '@/meeting/interface/dto/external-reference.dto';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  it('응답은 CreateMeetingResponse 형식(code/source/startedAt ISO)으로 직렬화된다', async () => {
    const { controller } = makeController();
    const result = await controller.createMeeting(dtoOf('web'));
    expect(result).toEqual({
      code: 'abc12xyz',
      source: 'web',
      startedAt: '2026-01-01T00:00:00.000Z',
    });
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
    });
    m.close(endedAt);
    return m;
  };

  const makeController = () => {
    const calls: Array<{ code: string; reason: string }> = [];
    const service = {
      closeMeeting: jest.fn(async (cmd: { code: string; reason: string }) => {
        calls.push(cmd);
        return makeClosed();
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controller = new MeetingController(service as any);
    return { controller, service, calls };
  };

  it('service.closeMeeting을 code + reason="manual"로 호출한다', async () => {
    const { controller, calls } = makeController();
    await controller.closeMeeting('abc12xyz');
    expect(calls).toEqual([{ code: 'abc12xyz', reason: 'manual' }]);
  });

  it('응답은 CloseMeetingResponse 형식(code/endedAt ISO)으로 직렬화된다', async () => {
    const { controller } = makeController();
    const result = await controller.closeMeeting('abc12xyz');
    expect(result).toEqual({
      code: 'abc12xyz',
      endedAt: '2026-01-01T00:30:00.000Z',
    });
  });

  it('잘못된 code 형식(대문자·길이 등)은 BadRequestException으로 거부하고 service를 호출하지 않는다', async () => {
    const { controller, service } = makeController();
    await expect(controller.closeMeeting('BAD')).rejects.toBeInstanceOf(BadRequestException);
    expect(service.closeMeeting).not.toHaveBeenCalled();
  });

  it('service가 MeetingNotFoundError를 던지면 NotFoundException으로 매핑된다', async () => {
    const service = {
      closeMeeting: jest.fn(async () => {
        throw new MeetingNotFoundError('abc12xyz');
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controller = new MeetingController(service as any);
    await expect(controller.closeMeeting('abc12xyz')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('service의 기타 도메인 에러는 그대로 전파된다(NotFoundException으로 감싸지 않음)', async () => {
    const service = {
      closeMeeting: jest.fn(async () => {
        throw new Error('Meeting is already closed');
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controller = new MeetingController(service as any);
    await expect(controller.closeMeeting('abc12xyz')).rejects.toThrow(/already closed/);
  });
});
