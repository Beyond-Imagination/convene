import { act, renderHook, waitFor } from '@testing-library/react';

import {
  BugReportApiError,
  submitBugReport,
  uploadBugReportImage,
} from '@/shared/api/bug-report.api';

import { detectEnvironment, useBugReportViewModel } from './useBugReportViewModel';

vi.mock('@/shared/api/bug-report.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/bug-report.api')>();
  return { ...actual, submitBugReport: vi.fn(), uploadBugReportImage: vi.fn() };
});

const png = (name = 'shot.png', bytes = 10): File =>
  new File([new Uint8Array(bytes)], name, { type: 'image/png' });

describe('detectEnvironment', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Windows',
      'Chrome 141',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      'Windows',
      'Edge 141',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      'iOS (모바일)',
      'Safari 18',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
      'Android (모바일)',
      'Chrome 141',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0',
      'macOS',
      'Firefox 131',
    ],
  ])('%s → %s / %s', (userAgent, device, browser) => {
    const env = detectEnvironment({ userAgent });
    expect(env.device).toBe(device);
    expect(env.browser).toBe(browser);
  });

  it('브라우저가 알려 주면 네트워크 종류를 채운다', () => {
    expect(
      detectEnvironment({ userAgent: '', connection: { type: 'wifi', effectiveType: '4g' } })
        .network,
    ).toBe('wifi · 4g');
    expect(detectEnvironment({ userAgent: '' }).network).toBe('');
  });
});

describe('useBugReportViewModel', () => {
  beforeEach(() => {
    vi.mocked(submitBugReport).mockReset().mockResolvedValue(undefined);
    vi.mocked(uploadBugReportImage).mockReset().mockResolvedValue('fu-1');
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 9, 14, 14, 5));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('회의 중에 열면 회의 코드·회의 화면·현재 시각을 미리 채운다', () => {
    const { result } = renderHook(() =>
      useBugReportViewModel({ meetingCode: 'abc12xyz', location: 'meeting' }),
    );
    expect(result.current.fields.meetingCode).toBe('abc12xyz');
    expect(result.current.locations).toEqual(['meeting']);
    expect(result.current.fields.occurredAt).toBe('2026-10-14 14:05');
  });

  it('무슨 일과 발생 위치가 있어야 보낼 수 있다', () => {
    const { result } = renderHook(() => useBugReportViewModel());
    expect(result.current.canSubmit).toBe(false);
    act(() => result.current.setField('summary', '소리가 안 들려요'));
    expect(result.current.canSubmit).toBe(false);
    act(() => result.current.toggleLocation('home'));
    expect(result.current.canSubmit).toBe(true);
    act(() => result.current.toggleLocation('home'));
    expect(result.current.canSubmit).toBe(false);
  });

  it('재현 단계를 더하고 고치고 지운다', () => {
    const { result } = renderHook(() => useBugReportViewModel());
    expect(result.current.steps).toEqual(['', '', '']);
    act(() => result.current.setStep(0, '입장'));
    act(() => result.current.addStep());
    act(() => result.current.removeStep(1));
    expect(result.current.steps).toEqual(['입장', '', '']);
  });

  it('이미지가 아니거나 너무 크거나 너무 많으면 받지 않는다', () => {
    const { result } = renderHook(() => useBugReportViewModel());
    act(() => result.current.addImages([new File(['x'], 'a.mp4', { type: 'video/mp4' })]));
    expect(result.current.images).toHaveLength(0);
    expect(result.current.imageError).toBe('type');

    act(() => result.current.addImages([png('big.png', 6 * 1024 * 1024)]));
    expect(result.current.imageError).toBe('size');

    act(() =>
      result.current.addImages([png('1'), png('2'), png('3'), png('4'), png('5'), png('6')]),
    );
    expect(result.current.images).toHaveLength(5);
    expect(result.current.imageError).toBe('count');
  });

  it('보내면 이미지를 먼저 올리고 그 id 와 함께 접수한다', async () => {
    const { result } = renderHook(() =>
      useBugReportViewModel({ meetingCode: 'abc12xyz', location: 'meeting' }),
    );
    act(() => {
      result.current.setField('summary', ' 소리가 안 들려요 ');
      result.current.setStep(0, '입장');
      result.current.addImages([png()]);
    });
    await act(() => result.current.submit());

    expect(uploadBugReportImage).toHaveBeenCalledTimes(1);
    expect(submitBugReport).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: '소리가 안 들려요',
        locations: ['meeting'],
        meetingCode: 'abc12xyz',
        steps: ['입장'],
        imageUploadIds: ['fu-1'],
      }),
    );
    expect(result.current.status).toBe('done');
  });

  it('그 외를 고르지 않았으면 그 외 설명은 보내지 않는다', async () => {
    const { result } = renderHook(() => useBugReportViewModel({ location: 'home' }));
    act(() => {
      result.current.setField('summary', 'x');
      result.current.setField('otherLocation', '설정');
    });
    await act(() => result.current.submit());
    expect(vi.mocked(submitBugReport).mock.calls[0][0].otherLocation).toBeUndefined();
  });

  it.each([
    [429, 'rate-limited'],
    [404, 'unavailable'],
    [413, 'too-large'],
    [500, 'failed'],
  ] as const)('접수 실패 %i 는 %s 로 알린다', async (status, kind) => {
    vi.mocked(submitBugReport).mockRejectedValueOnce(new BugReportApiError(status, 'x'));
    const { result } = renderHook(() => useBugReportViewModel({ location: 'home' }));
    act(() => result.current.setField('summary', 'x'));
    await act(() => result.current.submit());
    expect(result.current.status).toBe('error');
    expect(result.current.errorKind).toBe(kind);
  });

  it('reset 하면 새 리포트를 쓸 수 있게 비운다', async () => {
    const { result } = renderHook(() => useBugReportViewModel({ location: 'home' }));
    act(() => result.current.setField('summary', 'x'));
    await act(() => result.current.submit());
    act(() => result.current.reset());
    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(result.current.fields.summary).toBe('');
    expect(result.current.locations).toEqual(['home']);
  });
});
