import type { LeaveMeetingMessage } from '@migration/shared-interfaces';

/**
 * `meeting:leave` WS payload DTO (stub).
 *
 * 구현은 LeaveMeetingDto spec green 사이클에서 채운다.
 */
export class LeaveMeetingDto implements LeaveMeetingMessage {
  code!: string;
}
