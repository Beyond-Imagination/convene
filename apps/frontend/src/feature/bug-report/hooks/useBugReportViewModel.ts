'use client';

import type { BugReportLocation } from '@convene/shared-interfaces';

export interface DetectedEnvironment {
  readonly device: string;
  readonly browser: string;
  readonly network: string;
}

export interface NavigatorLike {
  readonly userAgent: string;
  readonly connection?: { readonly type?: string; readonly effectiveType?: string };
}

export function detectEnvironment(_nav: NavigatorLike): DetectedEnvironment {
  throw new Error('not implemented');
}

export interface BugReportFields {
  readonly summary: string;
  readonly otherLocation: string;
  readonly meetingCode: string;
  readonly occurredAt: string;
  readonly expected: string;
  readonly device: string;
  readonly browser: string;
  readonly network: string;
  readonly notes: string;
}

export interface BugReportImageItem {
  readonly id: string;
  readonly name: string;
  readonly previewUrl: string;
}

export type BugReportImageError = 'type' | 'size' | 'count';
export type BugReportErrorKind = 'rate-limited' | 'unavailable' | 'too-large' | 'failed';
export type BugReportStatus = 'idle' | 'submitting' | 'done' | 'error';

export interface BugReportInitial {
  readonly meetingCode?: string;
  readonly location?: BugReportLocation;
}

export interface UseBugReportViewModel {
  readonly fields: BugReportFields;
  readonly setField: (key: keyof BugReportFields, value: string) => void;
  readonly locations: ReadonlyArray<BugReportLocation>;
  readonly toggleLocation: (location: BugReportLocation) => void;
  readonly steps: ReadonlyArray<string>;
  readonly setStep: (index: number, value: string) => void;
  readonly addStep: () => void;
  readonly removeStep: (index: number) => void;
  readonly images: ReadonlyArray<BugReportImageItem>;
  readonly imageError: BugReportImageError | null;
  readonly addImages: (files: ReadonlyArray<File>) => void;
  readonly removeImage: (id: string) => void;
  readonly canSubmit: boolean;
  readonly status: BugReportStatus;
  readonly errorKind: BugReportErrorKind | null;
  readonly submit: () => Promise<void>;
  readonly reset: () => void;
}

export function useBugReportViewModel(_initial: BugReportInitial = {}): UseBugReportViewModel {
  throw new Error('not implemented');
}
