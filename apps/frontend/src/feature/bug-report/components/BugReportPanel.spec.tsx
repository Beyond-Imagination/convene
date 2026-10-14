import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { submitBugReport } from '@/shared/api/bug-report.api';

import { BugReportDialog, BugReportPanel } from './BugReportPanel';

vi.mock('@/shared/api/bug-report.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/bug-report.api')>();
  return { ...actual, submitBugReport: vi.fn(), uploadBugReportImage: vi.fn() };
});

describe('BugReportPanel', () => {
  beforeEach(() => {
    vi.mocked(submitBugReport).mockReset().mockResolvedValue(undefined);
  });

  it('양식의 항목을 순서대로 보여 준다', () => {
    render(<BugReportPanel />);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      '무슨 일이 있었나요',
      '어디서 발생했나요',
      '회의 코드와 발생 시각',
      '재현 방법',
      '기대한 동작',
      '사용 환경',
      '화면 캡쳐',
      '그 밖에',
    ]);
  });

  it('무슨 일과 발생 위치를 채워야 보내기 버튼이 켜지고, 보내면 접수 완료를 보여 준다', async () => {
    render(<BugReportPanel />);
    const send = screen.getByRole('button', { name: '버그 리포트 보내기' });
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByLabelText('무슨 일이 있었나요'), {
      target: { value: '소리가 안 들려요' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: '회의 화면' }));
    expect(send).toBeEnabled();

    fireEvent.click(send);
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(submitBugReport).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '새 리포트 작성' })).toBeInTheDocument();
  });

  it('접수에 실패하면 경고로 알린다', async () => {
    vi.mocked(submitBugReport).mockRejectedValueOnce(new Error('network'));
    render(<BugReportPanel location="home" />);
    fireEvent.change(screen.getByLabelText('무슨 일이 있었나요'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: '버그 리포트 보내기' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});

describe('BugReportDialog', () => {
  it('회의 중 모달은 회의 코드를 미리 채워 연다', () => {
    render(
      <BugReportDialog
        isOpen
        onClose={vi.fn()}
        meetingCode="abc12xyz"
      />,
    );
    expect(screen.getByRole('dialog', { name: '버그 리포트' })).toBeInTheDocument();
    expect(screen.getByLabelText('회의 코드')).toHaveValue('abc12xyz');
    expect(screen.getByRole('checkbox', { name: '회의 화면' })).toBeChecked();
  });

  it('닫혀 있으면 그리지 않는다', () => {
    render(
      <BugReportDialog
        isOpen={false}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
