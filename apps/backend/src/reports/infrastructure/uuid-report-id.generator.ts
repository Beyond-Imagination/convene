import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { ReportIdGenerator } from '@/reports/domain/ports';

/**
 * ReportIdGenerator 의 production 구현체.
 *
 * `crypto.randomUUID()` (RFC 4122 v4)를 그대로 사용해 36자 문자열 id 를 생성한다.
 * MongoDB ObjectId 와의 호환 여부는 운영 컬렉션 스키마(_id 타입)에서 결정한다.
 */
@Injectable()
export class UuidReportIdGenerator implements ReportIdGenerator {
  next(): string {
    return randomUUID();
  }
}
