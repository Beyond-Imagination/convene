import { MEETING_EVENTS, REPORT_EVENTS } from '@migration/shared-interfaces';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { NestEventBusDomainEventPublisher } from './nest-event-bus.publisher';

describe('NestEventBusDomainEventPublisher', () => {
  const makeEmitter = () => new EventEmitter2({ wildcard: true, delimiter: '.' });

  it('publish는 EventEmitter2.emit으로 그대로 위임된다', () => {
    const emitter = makeEmitter();
    const received: Array<{ name: string; payload: unknown }> = [];
    emitter.on(MEETING_EVENTS.ENDED, (payload) => {
      received.push({ name: MEETING_EVENTS.ENDED, payload });
    });

    const publisher = new NestEventBusDomainEventPublisher(emitter);
    const payload = { code: 'abc12xyz', endedAt: new Date('2026-01-01T00:00:00Z'), reason: 'manual' };
    publisher.publish(MEETING_EVENTS.ENDED, payload);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ name: MEETING_EVENTS.ENDED, payload });
  });

  it('서로 다른 이벤트 이름은 서로 다른 리스너에 전달된다', () => {
    const emitter = makeEmitter();
    const meetingEnded: unknown[] = [];
    const reportFinalized: unknown[] = [];
    emitter.on(MEETING_EVENTS.ENDED, (p) => meetingEnded.push(p));
    emitter.on(REPORT_EVENTS.FINALIZED, (p) => reportFinalized.push(p));

    const publisher = new NestEventBusDomainEventPublisher(emitter);
    publisher.publish(MEETING_EVENTS.ENDED, { a: 1 });
    publisher.publish(REPORT_EVENTS.FINALIZED, { b: 2 });

    expect(meetingEnded).toEqual([{ a: 1 }]);
    expect(reportFinalized).toEqual([{ b: 2 }]);
  });

  it('wildcard 구독자에게도 도달한다 (메타 핸들러용 sanity)', () => {
    const emitter = makeEmitter();
    const seen: string[] = [];
    emitter.on('meeting.**', function (this: { event: string }) {
      seen.push(this.event);
    });

    const publisher = new NestEventBusDomainEventPublisher(emitter);
    publisher.publish(MEETING_EVENTS.CREATED, {});
    publisher.publish(MEETING_EVENTS.ENDED, {});
    publisher.publish(REPORT_EVENTS.FINALIZED, {}); // 매칭 안 됨

    expect(seen).toEqual([MEETING_EVENTS.CREATED, MEETING_EVENTS.ENDED]);
  });
});
