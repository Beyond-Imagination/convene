import type { ReportListItem } from '@convene/shared-interfaces';
import { fireEvent, render, screen } from '@testing-library/react';

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
  notionSynced: false,
  ...overrides,
});

const baseVm = (overrides: Partial<UseReportListViewModel> = {}): UseReportListViewModel => ({
  status: 'loaded',
  items: [],
  page: { number: 1, size: 20, totalItems: 0, totalPages: 0 },
  errorMessage: null,
  refresh: vi.fn(async () => {}),
  goToPage: vi.fn(),
  ...overrides,
});

describe('ReportList View', () => {
  it('status="loading" 이면 로딩 안내(role="status")만 노출한다', () => {
    render(<ReportList {...baseVm({ status: 'loading' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중');
    expect(screen.queryByTestId('report-list-item')).toBeNull();
  });

  it('status="error" 이면 alert + 다시 시도 버튼을 노출한다', () => {
    const refresh = vi.fn(async () => {});
    render(<ReportList {...baseVm({ status: 'error', errorMessage: 'mongo down', refresh })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('mongo down');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('status="loaded" + items 비어 있으면 빈 상태 메시지를 노출한다', () => {
    render(<ReportList {...baseVm({ status: 'loaded', items: [] })} />);
    expect(screen.getByTestId('report-list-empty')).toBeInTheDocument();
  });

  it('items가 있으면 각 항목을 link로 렌더한다 (제목/code/참가자 수 노출)', () => {
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

  it('페이지가 하나뿐이면 페이저를 그리지 않는다', () => {
    render(
      <ReportList
        {...baseVm({
          items: [item()],
          page: { number: 1, size: 20, totalItems: 3, totalPages: 1 },
        })}
      />,
    );
    expect(screen.queryByRole('navigation', { name: '회의록 페이지' })).toBeNull();
  });

  it('페이지가 여러 개면 번호와 이전/다음을 그리고, 번호를 누르면 goToPage를 호출한다', () => {
    const goToPage = vi.fn();
    render(
      <ReportList
        {...baseVm({
          items: [item()],
          page: { number: 1, size: 20, totalItems: 43, totalPages: 3 },
          goToPage,
        })}
      />,
    );
    expect(screen.getByRole('navigation', { name: '회의록 페이지' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(goToPage).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByTestId('report-page-next'));
    expect(goToPage).toHaveBeenLastCalledWith(2);
  });

  it('첫 페이지에서는 이전이, 마지막 페이지에서는 다음이 비활성이다', () => {
    const { unmount } = render(
      <ReportList
        {...baseVm({
          items: [item()],
          page: { number: 1, size: 20, totalItems: 43, totalPages: 3 },
        })}
      />,
    );
    expect(screen.getByTestId('report-page-prev')).toBeDisabled();
    expect(screen.getByTestId('report-page-next')).toBeEnabled();
    unmount();

    render(
      <ReportList
        {...baseVm({
          items: [item()],
          page: { number: 3, size: 20, totalItems: 43, totalPages: 3 },
        })}
      />,
    );
    expect(screen.getByTestId('report-page-prev')).toBeEnabled();
    expect(screen.getByTestId('report-page-next')).toBeDisabled();
  });

  it('페이지가 많아도 번호는 현재 페이지 주변 5개만 그린다', () => {
    render(
      <ReportList
        {...baseVm({
          items: [item()],
          page: { number: 10, size: 20, totalItems: 400, totalPages: 20 },
        })}
      />,
    );
    const numbered = screen
      .getAllByRole('button')
      .map((b) => b.textContent)
      .filter((text) => text !== null && /^\d+$/.test(text));
    expect(numbered).toEqual(['8', '9', '10', '11', '12']);
    expect(screen.getByRole('button', { name: '10' })).toHaveAttribute('aria-current', 'page');
  });

  it('노션에 동기화된 항목만 배지를 단다', () => {
    render(
      <ReportList
        {...baseVm({
          status: 'loaded',
          items: [item({ id: 'r1', notionSynced: true }), item({ id: 'r2', notionSynced: false })],
        })}
      />,
    );
    const links = screen.getAllByTestId('report-list-item');
    expect(links[0]).toHaveTextContent('NOTION 동기화됨');
    expect(links[1]).not.toHaveTextContent('NOTION');
  });
});
