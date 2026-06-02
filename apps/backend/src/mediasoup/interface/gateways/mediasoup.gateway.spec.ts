import { MEDIASOUP_WS_EVENTS } from '@migration/shared-interfaces';
import type { Socket } from 'socket.io';

import { MediasoupSignalingService } from '@/mediasoup/application/mediasoup-signaling.service';
import { CloseProducerDto } from '@/mediasoup/interface/dto/close-producer.dto';
import { ConnectTransportDto } from '@/mediasoup/interface/dto/connect-transport.dto';
import { ConsumeDto } from '@/mediasoup/interface/dto/consume.dto';
import { CreateTransportDto } from '@/mediasoup/interface/dto/create-transport.dto';
import { GetRtpCapabilitiesDto } from '@/mediasoup/interface/dto/get-rtp-capabilities.dto';
import { ProduceDto } from '@/mediasoup/interface/dto/produce.dto';
import { ResumeConsumerDto } from '@/mediasoup/interface/dto/resume-consumer.dto';
import { ToggleProducerDto } from '@/mediasoup/interface/dto/toggle-producer.dto';

import { MediasoupGateway } from './mediasoup.gateway';

interface CapturedCall {
  name: string;
  args: unknown[];
}

interface CapturedEmit {
  room: string;
  except?: string;
  event: string;
  payload: unknown;
}

const makeServer = (emits: CapturedEmit[]) =>
  ({
    to: (room: string) => ({
      except: (except: string) => ({
        emit: (event: string, payload: unknown) => {
          emits.push({ room, except, event, payload });
          return true;
        },
      }),
      emit: (event: string, payload: unknown) => {
        emits.push({ room, event, payload });
        return true;
      },
    }),
  }) as never;

const makeService = () => {
  const calls: CapturedCall[] = [];
  const service = {
    getRtpCapabilities: async (cmd: unknown) => {
      calls.push({ name: 'getRtpCapabilities', args: [cmd] });
      return { fakeRtp: true };
    },
    createTransport: async (cmd: unknown) => {
      calls.push({ name: 'createTransport', args: [cmd] });
      return { id: 't-1', iceParameters: {}, iceCandidates: [], dtlsParameters: {} };
    },
    connectTransport: async (cmd: unknown) => {
      calls.push({ name: 'connectTransport', args: [cmd] });
    },
    produce: async (cmd: unknown) => {
      calls.push({ name: 'produce', args: [cmd] });
      return { producerId: 'p-1' };
    },
    consume: async (cmd: unknown) => {
      calls.push({ name: 'consume', args: [cmd] });
      return { id: 'c-1', producerId: 'p-1', kind: 'audio' as const, rtpParameters: {} };
    },
    resumeConsumer: async (cmd: unknown) => {
      calls.push({ name: 'resumeConsumer', args: [cmd] });
    },
    toggleProducer: async (cmd: unknown) => {
      calls.push({ name: 'toggleProducer', args: [cmd] });
    },
    closeProducer: async (cmd: unknown) => {
      calls.push({ name: 'closeProducer', args: [cmd] });
    },
  };
  return { calls, service: service as unknown as MediasoupSignalingService };
};

const makeClient = (id: string): Socket => ({ id }) as unknown as Socket;

const setup = () => {
  const { calls, service } = makeService();
  const emits: CapturedEmit[] = [];
  const gateway = new MediasoupGateway(service);
  gateway.server = makeServer(emits);
  return { gateway, calls, emits };
};

const codeStr = 'abc12xyz';

describe('MediasoupGateway.handleGetRtpCapabilities', () => {
  it('service 호출 후 { rtpCapabilities } wire format 으로 반환한다', async () => {
    const { gateway, calls } = setup();
    const dto = Object.assign(new GetRtpCapabilitiesDto(), { code: codeStr });
    const res = await gateway.handleGetRtpCapabilities(dto, makeClient('s1'));
    expect(calls).toEqual([
      { name: 'getRtpCapabilities', args: [{ meetingCode: codeStr }] },
    ]);
    expect(res).toEqual({ rtpCapabilities: { fakeRtp: true } });
  });
});

describe('MediasoupGateway.handleCreateTransport', () => {
  it('dto + client.id 를 service.createTransport 에 위임하고 응답을 반환한다', async () => {
    const { gateway, calls } = setup();
    const dto = Object.assign(new CreateTransportDto(), { code: codeStr, direction: 'send' });
    const res = await gateway.handleCreateTransport(dto, makeClient('s1'));
    expect(calls[0]).toEqual({
      name: 'createTransport',
      args: [{ meetingCode: codeStr, participantId: 's1', direction: 'send' }],
    });
    expect(res.id).toBe('t-1');
  });
});

describe('MediasoupGateway.handleConnectTransport', () => {
  it('dto + client.id 를 service.connectTransport 에 위임한다', async () => {
    const { gateway, calls } = setup();
    const dto = Object.assign(new ConnectTransportDto(), {
      code: codeStr,
      transportId: 't-1',
      dtlsParameters: { fp: 'aa' },
    });
    await gateway.handleConnectTransport(dto, makeClient('s1'));
    expect(calls[0]).toEqual({
      name: 'connectTransport',
      args: [
        {
          meetingCode: codeStr,
          participantId: 's1',
          transportId: 't-1',
          dtlsParameters: { fp: 'aa' },
        },
      ],
    });
  });
});

describe('MediasoupGateway.handleProduce', () => {
  it('dto + client.id 를 service.produce 에 위임하고 producerId 응답', async () => {
    const { gateway, calls } = setup();
    const dto = Object.assign(new ProduceDto(), {
      code: codeStr,
      transportId: 't-1',
      kind: 'audio',
      source: 'audio',
      rtpParameters: { codecs: [] },
    });
    const res = await gateway.handleProduce(dto, makeClient('s1'));
    expect(calls[0]).toEqual({
      name: 'produce',
      args: [
        {
          meetingCode: codeStr,
          participantId: 's1',
          transportId: 't-1',
          kind: 'audio',
          source: 'audio',
          rtpParameters: { codecs: [] },
        },
      ],
    });
    expect(res).toEqual({ producerId: 'p-1' });
  });

  it('dto.paused 를 service.produce 에 전달한다(기본 OFF 로 입장하는 경우)', async () => {
    const { gateway, calls } = setup();
    const dto = Object.assign(new ProduceDto(), {
      code: codeStr,
      transportId: 't-1',
      kind: 'video',
      source: 'video',
      rtpParameters: { codecs: [] },
      paused: true,
    });
    await gateway.handleProduce(dto, makeClient('s1'));
    expect(calls[0].args[0]).toMatchObject({ paused: true });
  });
});

describe('MediasoupGateway.handleConsume', () => {
  it('dto + client.id 를 service.consume 에 위임한다', async () => {
    const { gateway, calls } = setup();
    const dto = Object.assign(new ConsumeDto(), {
      code: codeStr,
      transportId: 't-1',
      producerId: 'p-1',
      rtpCapabilities: { codecs: [] },
    });
    const res = await gateway.handleConsume(dto, makeClient('s1'));
    expect(calls[0]).toEqual({
      name: 'consume',
      args: [
        {
          meetingCode: codeStr,
          participantId: 's1',
          transportId: 't-1',
          producerId: 'p-1',
          rtpCapabilities: { codecs: [] },
        },
      ],
    });
    expect(res.id).toBe('c-1');
  });
});

describe('MediasoupGateway.handleResumeConsumer', () => {
  it('dto + client.id 를 service.resumeConsumer 에 위임한다', async () => {
    const { gateway, calls } = setup();
    const dto = Object.assign(new ResumeConsumerDto(), { code: codeStr, consumerId: 'c-1' });
    await gateway.handleResumeConsumer(dto, makeClient('s1'));
    expect(calls[0]).toEqual({
      name: 'resumeConsumer',
      args: [{ meetingCode: codeStr, participantId: 's1', consumerId: 'c-1' }],
    });
  });
});

describe('MediasoupGateway.handleToggleProducer', () => {
  it('dto + client.id 를 service.toggleProducer 에 위임하고 PRODUCER_TOGGLED 를 본인 제외 broadcast 한다', async () => {
    const { gateway, calls, emits } = setup();
    const dto = Object.assign(new ToggleProducerDto(), {
      code: codeStr,
      producerId: 'p-1',
      paused: true,
    });
    const res = await gateway.handleToggleProducer(dto, makeClient('s1'));
    expect(calls[0]).toEqual({
      name: 'toggleProducer',
      args: [{ meetingCode: codeStr, participantId: 's1', producerId: 'p-1', paused: true }],
    });
    expect(emits).toEqual([
      {
        room: `meeting:${codeStr}`,
        except: 's1',
        event: MEDIASOUP_WS_EVENTS.PRODUCER_TOGGLED,
        payload: { producerId: 'p-1', paused: true },
      },
    ]);
    expect(res).toEqual({ ok: true });
  });
});

describe('MediasoupGateway.handleCloseProducer', () => {
  it('dto + client.id 를 service.closeProducer 에 위임하고 PRODUCER_CLOSED 를 본인 제외 broadcast 한다', async () => {
    const { gateway, calls, emits } = setup();
    const dto = Object.assign(new CloseProducerDto(), {
      code: codeStr,
      producerId: 'p-1',
    });
    const res = await gateway.handleCloseProducer(dto, makeClient('s1'));
    expect(calls[0]).toEqual({
      name: 'closeProducer',
      args: [{ meetingCode: codeStr, participantId: 's1', producerId: 'p-1' }],
    });
    expect(emits).toEqual([
      {
        room: `meeting:${codeStr}`,
        except: 's1',
        event: MEDIASOUP_WS_EVENTS.PRODUCER_CLOSED,
        payload: { producerId: 'p-1' },
      },
    ]);
    expect(res).toEqual({ ok: true });
  });
});

describe('MediasoupGateway.onProducerCreated', () => {
  it('같은 회의 room 에 newProducer 브로드캐스트를 보내되 producer 본인은 제외한다', () => {
    const { gateway, emits } = setup();
    gateway.onProducerCreated({
      meetingCode: codeStr,
      participantId: 's2',
      producerId: 'p-1',
      kind: 'audio',
      source: 'audio',
    });
    expect(emits).toEqual([
      {
        room: `meeting:${codeStr}`,
        except: 's2',
        event: MEDIASOUP_WS_EVENTS.NEW_PRODUCER,
        payload: {
          peerSocketId: 's2',
          producerId: 'p-1',
          kind: 'audio',
          source: 'audio',
          paused: false,
        },
      },
    ]);
  });

  it('payload.paused=true 면 newProducer 브로드캐스트에도 paused:true 가 실린다', () => {
    const { gateway, emits } = setup();
    gateway.onProducerCreated({
      meetingCode: codeStr,
      participantId: 's2',
      producerId: 'p-9',
      kind: 'video',
      source: 'video',
      paused: true,
    });
    expect(emits[0].payload).toMatchObject({ producerId: 'p-9', paused: true });
  });
});
