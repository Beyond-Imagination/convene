import { fireEvent, render, screen } from '@testing-library/react';

import type { ReportListItem } from '@migration/shared-interfaces';

import type { UseReportListViewModel } from '@/feature/reports/hooks/useReportListViewModel';

import { ReportList } from './ReportList';

const item = (overrides: Partial<ReportListItem> = {}): ReportListItem => ({
  id: 'r1',
  code: 'abc12xyz',
  source: 'web',
  startedAt: '2026-01-01T00:00:00.000Z',
  endedAt: '2026-01-01T01:00:00.000Z',
  participantCount: 2,
  pipeline: { sttStatus: 'done', summaryStatus: 'done' },
  title: '주간 미팅',
  ...overrides,
});

const baseVm = (
  overrides: Partial<UseReportListViewModel> = {},
): UseReportListViewModel => ({
  status: 'loaded',
  items: [],
  errorMessage: null,
  refresh: vi.fn(async () => {}),
  ...overrides,
});

describe('ReportList View', () => {
  it('status="loading" 이면 로딩 안내(role="status") 만 노출한다', () => {
    render(<ReportList {...baseVm({ status: 'loading' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중');
    expect(screen.queryByTestId('report-list-item')).toBeNull();
  });

  it('status="error" 이면 alert + 다시 시도 버튼을 노출한다', () => {
    const refresh = vi.fn(async () => {});
    render(
      <ReportList
        {...baseVm({ status: 'error', errorMessage: 'mongo down', refresh })}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('mongo down');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('status="loaded" + items 비어 있으면 빈 상태 메시지를 노출한다', () => {
    render(<ReportList {...baseVm({ status: 'loaded', items: [] })} />);
    expect(screen.getByTestId('report-list-empty')).toBeInTheDocument();
  });

  it('items 가 있으면 각 항목을 link 로 렌더한다 (제목/code/참가자 수 노출)', () => {
    render(
      <ReportList
        {...baseVm({
          status: 'loaded',
          items: [
            item({ id: 'r1', code: 'abc12xyz', title: '주간 미팅', participantCount: 3 }),
            item({ id: 'r2', code: 'xyz99aaa', title: null, participantCount: 1 }),
          ],
        })}
      />,
    );
    const links = screen.getAllByTestId('report-list-item');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/reports/r1');
    expect(links[0]).toHaveTextContent('주간 미팅');
    expect(links[0]).toHaveTextContent('abc12xyz');
    expect(links[0]).toHaveTextContent('3');
    expect(links[1]).toHaveAttribute('href', '/reports/r2');
    expect(links[1]).toHaveTextContent('xyz99aaa');
  });
});
