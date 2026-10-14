'use client';

import {
  BUG_REPORT_LIMITS,
  BUG_REPORT_LOCATIONS,
  type BugReportLocation,
  type BugReportRequest,
} from '@convene/shared-interfaces';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  BugReportApiError,
  submitBugReport,
  uploadBugReportImage,
} from '@/shared/api/bug-report.api';

export interface DetectedEnvironment {
  readonly device: string;
  readonly browser: string;
  readonly network: string;
}

export interface NavigatorLike {
  readonly userAgent: string;
  readonly connection?: { readonly type?: string; readonly effectiveType?: string };
}

const OS_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // iOS·Android 의 UA 에는 Mac OS X·Linux 도 들어 있어 먼저 본다.
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Macintosh|Mac OS X/, 'macOS'],
  [/Linux/, 'Linux'],
];

// Edge·Opera 의 UA 에는 Chrome 도, Chrome 에는 Safari 도 들어 있어 순서가 중요하다.
const BROWSER_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg(?:e|A|iOS)?\/(\d+)/, 'Edge'],
  [/OPR\/(\d+)/, 'Opera'],
  [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
  [/(?:Chrome|CriOS)\/(\d+)/, 'Chrome'],
  [/Version\/(\d+).*Safari/, 'Safari'],
];

/** 사용 환경 항목을 미리 채울 값. 사용자가 고칠 수 있으니 대략적이어도 된다. */
export function detectEnvironment(nav: NavigatorLike): DetectedEnvironment {
  const ua = nav.userAgent;
  const os = OS_PATTERNS.find(([pattern]) => pattern.test(ua))?.[1] ?? '';
  const isMobile = /Mobi|iPhone|Android/.test(ua);
  const device = os === '' ? '' : isMobile ? `${os} (모바일)` : os;

  let browser = '';
  for (const [pattern, name] of BROWSER_PATTERNS) {
    const match = pattern.exec(ua);
    if (match !== null) {
      browser = `${name} ${match[1]}`;
      break;
    }
  }

  const network = [nav.connection?.type, nav.connection?.effectiveType]
    .filter((v): v is string => v !== undefined && v !== '')
    .join(' · ');
  return { device, browser, network };
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

const DEFAULT_STEPS: ReadonlyArray<string> = ['', '', ''];
const IMAGE_TYPES: ReadonlyArray<string> = BUG_REPORT_LIMITS.imageTypes;

const pad = (n: number): string => String(n).padStart(2, '0');

/** 사용자가 손보기 쉬운 로컬 시각 문자열. */
const formatNow = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

const blankFields = (meetingCode: string): BugReportFields => ({
  summary: '',
  otherLocation: '',
  meetingCode,
  occurredAt: '',
  expected: '',
  device: '',
  browser: '',
  network: '',
  notes: '',
});

// 정적 HTML 은 빌드 시점에 그려지므로 시각·기기 정보는 마운트 뒤에 채운다(하이드레이션 불일치 방지).
const withDetected = (fields: BugReportFields): BugReportFields => {
  const env = detectEnvironment(navigator as unknown as NavigatorLike);
  return {
    ...fields,
    occurredAt: fields.occurredAt || formatNow(new Date()),
    device: fields.device || env.device,
    browser: fields.browser || env.browser,
    network: fields.network || env.network,
  };
};

const optional = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const errorKindOf = (error: unknown): BugReportErrorKind => {
  if (!(error instanceof BugReportApiError)) return 'failed';
  if (error.status === 429) return 'rate-limited';
  // 버그 리포트가 꺼진 배포(노션 env 미주입)에서는 엔드포인트 자체가 없다.
  if (error.status === 404) return 'unavailable';
  if (error.status === 413) return 'too-large';
  return 'failed';
};

/**
 * 버그 리포트 양식의 상태와 제출. 페이지와 회의 중 모달이 함께 쓴다.
 * 이미지는 보낼 때 한 장씩 먼저 올리고, 받은 id 를 본문에 싣는다.
 */
export function useBugReportViewModel(initial: BugReportInitial = {}): UseBugReportViewModel {
  const initialMeetingCode = initial.meetingCode ?? '';
  const initialLocations: ReadonlyArray<BugReportLocation> =
    initial.location === undefined ? [] : [initial.location];

  const [fields, setFields] = useState<BugReportFields>(() => blankFields(initialMeetingCode));
  const [locations, setLocations] = useState<ReadonlyArray<BugReportLocation>>(initialLocations);
  const [steps, setSteps] = useState<ReadonlyArray<string>>(DEFAULT_STEPS);
  const [images, setImages] = useState<ReadonlyArray<BugReportImageItem & { file: File }>>([]);
  const [imageError, setImageError] = useState<BugReportImageError | null>(null);
  const [status, setStatus] = useState<BugReportStatus>('idle');
  const [errorKind, setErrorKind] = useState<BugReportErrorKind | null>(null);
  const nextImageId = useRef(0);
  const imagesRef = useRef(images);
  imagesRef.current = images;

  useEffect(() => {
    setFields(withDetected);
  }, []);

  // 미리보기 URL 은 닫힐 때 풀어 준다.
  useEffect(
    () => () => {
      for (const image of imagesRef.current) URL.revokeObjectURL(image.previewUrl);
    },
    [],
  );

  const setField = useCallback((key: keyof BugReportFields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleLocation = useCallback((location: BugReportLocation) => {
    setLocations((prev) =>
      prev.includes(location)
        ? prev.filter((l) => l !== location)
        : BUG_REPORT_LOCATIONS.filter((l) => l === location || prev.includes(l)),
    );
  }, []);

  const setStep = useCallback((index: number, value: string) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? value : s)));
  }, []);
  const addStep = useCallback(() => {
    setSteps((prev) => (prev.length >= BUG_REPORT_LIMITS.stepsMax ? prev : [...prev, '']));
  }, []);
  const removeStep = useCallback((index: number) => {
    setSteps((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const addImages = (files: ReadonlyArray<File>): void => {
    let error: BugReportImageError | null = null;
    const accepted: Array<BugReportImageItem & { file: File }> = [];
    for (const file of files) {
      if (images.length + accepted.length >= BUG_REPORT_LIMITS.imagesMax) {
        error = 'count';
        break;
      }
      if (!IMAGE_TYPES.includes(file.type)) {
        error = 'type';
        continue;
      }
      if (file.size > BUG_REPORT_LIMITS.imageBytesMax) {
        error = 'size';
        continue;
      }
      nextImageId.current += 1;
      accepted.push({
        id: String(nextImageId.current),
        name: file.name,
        previewUrl: URL.createObjectURL(file),
        file,
      });
    }
    setImageError(error);
    if (accepted.length > 0) setImages([...images, ...accepted]);
  };

  const removeImage = (id: string): void => {
    const target = images.find((image) => image.id === id);
    if (target !== undefined) URL.revokeObjectURL(target.previewUrl);
    setImages(images.filter((image) => image.id !== id));
    setImageError(null);
  };

  const canSubmit = fields.summary.trim() !== '' && locations.length > 0 && status !== 'submitting';

  const submit = async (): Promise<void> => {
    if (!canSubmit) return;
    setStatus('submitting');
    setErrorKind(null);
    try {
      const imageUploadIds: string[] = [];
      for (const image of images) imageUploadIds.push(await uploadBugReportImage(image.file));
      const request: BugReportRequest = {
        summary: fields.summary.trim(),
        locations,
        otherLocation: locations.includes('other') ? optional(fields.otherLocation) : undefined,
        meetingCode: optional(fields.meetingCode),
        occurredAt: optional(fields.occurredAt),
        steps: steps.map((s) => s.trim()).filter((s) => s !== ''),
        expected: optional(fields.expected),
        device: optional(fields.device),
        browser: optional(fields.browser),
        network: optional(fields.network),
        notes: optional(fields.notes),
        imageUploadIds,
      };
      await submitBugReport(request);
      setStatus('done');
    } catch (error) {
      setErrorKind(errorKindOf(error));
      setStatus('error');
    }
  };

  const reset = (): void => {
    for (const image of images) URL.revokeObjectURL(image.previewUrl);
    setImages([]);
    setImageError(null);
    setFields(withDetected(blankFields(initialMeetingCode)));
    setLocations(initialLocations);
    setSteps(DEFAULT_STEPS);
    setErrorKind(null);
    setStatus('idle');
  };

  return {
    fields,
    setField,
    locations,
    toggleLocation,
    steps,
    setStep,
    addStep,
    removeStep,
    images: images.map(({ id, name, previewUrl }) => ({ id, name, previewUrl })),
    imageError,
    addImages,
    removeImage,
    canSubmit,
    status,
    errorKind,
    submit,
    reset,
  };
}
