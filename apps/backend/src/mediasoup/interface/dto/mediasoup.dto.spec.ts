import { ValidationPipe } from '@nestjs/common';

import { ConnectTransportDto } from './connect-transport.dto';
import { ConsumeDto } from './consume.dto';
import { CreateTransportDto } from './create-transport.dto';
import { GetRtpCapabilitiesDto } from './get-rtp-capabilities.dto';
import { ProduceDto } from './produce.dto';
import { ResumeConsumerDto } from './resume-consumer.dto';
import { CloseProducerDto } from './close-producer.dto';
import { ToggleProducerDto } from './toggle-producer.dto';

const makePipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new Error(JSON.stringify(errors)),
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = <T>(metatype: any, body: unknown): Promise<T> =>
  makePipe().transform(body, { type: 'body', metatype }) as Promise<T>;

const code = 'abc12xyz';

describe('GetRtpCapabilitiesDto', () => {
  it('code 8자 정상 통과', async () => {
    const dto = await run<GetRtpCapabilitiesDto>(GetRtpCapabilitiesDto, { code });
    expect(dto).toBeInstanceOf(GetRtpCapabilitiesDto);
    expect(dto.code).toBe(code);
  });

  it('code 길이가 8이 아니면 거부', async () => {
    await expect(run(GetRtpCapabilitiesDto, { code: 'short' })).rejects.toThrow(/code/i);
  });
});

describe('CreateTransportDto', () => {
  it('정상 send/recv 통과', async () => {
    const send = await run<CreateTransportDto>(CreateTransportDto, { code, direction: 'send' });
    expect(send.direction).toBe('send');
    const recv = await run<CreateTransportDto>(CreateTransportDto, { code, direction: 'recv' });
    expect(recv.direction).toBe('recv');
  });

  it('direction 이 send/recv 외이면 거부', async () => {
    await expect(run(CreateTransportDto, { code, direction: 'bogus' })).rejects.toThrow(
      /direction/i,
    );
  });
});

describe('ConnectTransportDto', () => {
  it('정상 통과', async () => {
    const dto = await run<ConnectTransportDto>(ConnectTransportDto, {
      code,
      transportId: 't-1',
      dtlsParameters: { fingerprints: [{ algorithm: 'sha-256', value: 'aa' }] },
    });
    expect(dto.transportId).toBe('t-1');
  });

  it('dtlsParameters 누락 거부', async () => {
    await expect(
      run(ConnectTransportDto, { code, transportId: 't-1' }),
    ).rejects.toThrow(/dtlsParameters/i);
  });

  it('dtlsParameters 가 객체가 아니면 거부', async () => {
    await expect(
      run(ConnectTransportDto, { code, transportId: 't-1', dtlsParameters: 'string' }),
    ).rejects.toThrow(/dtlsParameters/i);
  });
});

describe('ProduceDto', () => {
  it('정상 audio/video/screen 통과', async () => {
    for (const source of ['audio', 'video', 'screen'] as const) {
      const dto = await run<ProduceDto>(ProduceDto, {
        code,
        transportId: 't-1',
        kind: source === 'audio' ? 'audio' : 'video',
        source,
        rtpParameters: { codecs: [] },
      });
      expect(dto.source).toBe(source);
    }
  });

  it('kind 가 audio/video 외이면 거부', async () => {
    await expect(
      run(ProduceDto, {
        code,
        transportId: 't-1',
        kind: 'image',
        source: 'video',
        rtpParameters: {},
      }),
    ).rejects.toThrow(/kind/i);
  });

  it('source 가 audio/video/screen 외이면 거부', async () => {
    await expect(
      run(ProduceDto, {
        code,
        transportId: 't-1',
        kind: 'audio',
        source: 'bogus',
        rtpParameters: {},
      }),
    ).rejects.toThrow(/source/i);
  });
});

describe('ConsumeDto', () => {
  it('정상 통과', async () => {
    const dto = await run<ConsumeDto>(ConsumeDto, {
      code,
      transportId: 't-1',
      producerId: 'p-1',
      rtpCapabilities: { codecs: [] },
    });
    expect(dto.producerId).toBe('p-1');
  });

  it('rtpCapabilities 누락 거부', async () => {
    await expect(
      run(ConsumeDto, { code, transportId: 't-1', producerId: 'p-1' }),
    ).rejects.toThrow(/rtpCapabilities/i);
  });
});

describe('ResumeConsumerDto', () => {
  it('정상 통과', async () => {
    const dto = await run<ResumeConsumerDto>(ResumeConsumerDto, { code, consumerId: 'c-1' });
    expect(dto.consumerId).toBe('c-1');
  });

  it('consumerId 가 너무 길면 거부', async () => {
    await expect(
      run(ResumeConsumerDto, { code, consumerId: 'x'.repeat(65) }),
    ).rejects.toThrow(/consumerId/i);
  });
});

describe('ToggleProducerDto', () => {
  it('정상 통과 (paused true/false)', async () => {
    const on = await run<ToggleProducerDto>(ToggleProducerDto, {
      code,
      producerId: 'p-1',
      paused: true,
    });
    expect(on.producerId).toBe('p-1');
    expect(on.paused).toBe(true);
    const off = await run<ToggleProducerDto>(ToggleProducerDto, {
      code,
      producerId: 'p-1',
      paused: false,
    });
    expect(off.paused).toBe(false);
  });

  it('paused 가 boolean 이 아니면 거부', async () => {
    await expect(
      run(ToggleProducerDto, { code, producerId: 'p-1', paused: 'yes' }),
    ).rejects.toThrow(/paused/i);
  });

  it('producerId 가 너무 길면 거부', async () => {
    await expect(
      run(ToggleProducerDto, { code, producerId: 'x'.repeat(65), paused: true }),
    ).rejects.toThrow(/producerId/i);
  });
});

describe('CloseProducerDto', () => {
  it('정상 통과', async () => {
    const dto = await run<CloseProducerDto>(CloseProducerDto, { code, producerId: 'p-1' });
    expect(dto.producerId).toBe('p-1');
  });

  it('producerId 가 너무 길면 거부', async () => {
    await expect(
      run(CloseProducerDto, { code, producerId: 'x'.repeat(65) }),
    ).rejects.toThrow(/producerId/i);
  });
});

describe('whitelist 위반', () => {
  it('허용되지 않은 키가 있으면 거부 (GetRtpCapabilities)', async () => {
    await expect(run(GetRtpCapabilitiesDto, { code, evil: 1 })).rejects.toThrow(/evil/);
  });
});
