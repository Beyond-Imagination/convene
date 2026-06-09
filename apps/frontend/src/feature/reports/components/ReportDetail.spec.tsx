import type { ReportDetailResponse } from '@convene/shared-interfaces';
import { render, screen, within } from '@testing-library/react';

import type { UseReportDetailViewModel } from '@/feature/reports/hooks/useReportDetailViewModel';

import { ReportDetail } from './ReportDetail';

const baseDetail = (overrides: Partial<ReportDetailResponse> = {}): ReportDetailResponse => ({
  id: 'r1',
  meetingId: 'm1',
  code: 'abc12xyz',
  source: 'web',
  title: null,
  externalReference: {},
  startedAt: '2026-01-01T00:00:00.000Z',
  endedAt: '2026-01-01T01:00:00.000Z',
  participants: [],
  chat: [],
  transcript: [],
  summary: null,
  pipeline: { sttStatus: 'done', summaryStatus: 'done', failures: [] },
  pushedToNotion: null,
  ...overrides,
});

const baseVm = (overrides: Partial<UseReportDetailViewModel> = {}): UseReportDetailViewModel => ({
  status: 'loaded',
  report: baseDetail(),
  errorMessage: null,
  ...overrides,
});

describe('ReportDetail View', () => {
  it('status="loading" 이면 로딩 안내(role="status")만 노출', () => {
    render(<ReportDetail {...baseVm({ status: 'loading', report: null })} />);
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중');
  });

  it('status="not-found" 이면 "회의록을 찾을 수 없습니다" 메시지', () => {
    render(<ReportDetail {...baseVm({ status: 'not-found', report: null })} />);
    expect(screen.getByTestId('report-not-found')).toBeInTheDocument();
  });

  it('status="error" 이면 alert로 errorMessage 노출', () => {
    render(
      <ReportDetail {...baseVm({ status: 'error', report: null, errorMessage: 'mongo down' })} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('mongo down');
  });

  it('회의 제목(title)이 있으면 헤더에 노출하고, 없으면 "회의록 {code}" 를 쓴다', () => {
    const { rerender } = render(<ReportDetail {...baseVm()} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('회의록 abc12xyz');
    rerender(<ReportDetail {...baseVm({ report: baseDetail({ title: '주간 스프린트' }) })} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('주간 스프린트');
  });

  it('summary가 null 이면 "요약 진행 중" 안내를 노출한다', () => {
    render(
      <ReportDetail
        {...baseVm({
          report: baseDetail({
            summary: null,
            pipeline: { sttStatus: 'done', summaryStatus: 'pending', failures: [] },
          }),
        })}
      />,
    );
    expect(screen.getByTestId('summary-pending')).toBeInTheDocument();
  });

  it('summary가 있으면 title/overview/decisions/actionItems/keyTopics를 모두 노출한다', () => {
    render(
      <ReportDetail
        {...baseVm({
          report: baseDetail({
            summary: {
              title: '주간 미팅 요약',
              overview: '이번 주는 마이그레이션을 마무리한다.',
              decisions: ['v1 출시 일정 확정'],
              actionItems: [{ owner: '준', task: '배포 스크립트 작성', due: '금요일' }],
              keyTopics: [
                { topic: '인프라', points: ['EC2 t3.small 한 대로 시작', '비용 모니터링'] },
              ],
            },
          }),
        })}
      />,
    );
    expect(screen.getByRole('heading', { name: /주간 미팅 요약/ })).toBeInTheDocument();
    expect(screen.getByText(/이번 주는 마이그레이션/)).toBeInTheDocument();
    expect(screen.getByText('v1 출시 일정 확정')).toBeInTheDocument();
    expect(screen.getByText(/배포 스크립트 작성/)).toBeInTheDocument();
    expect(screen.getByText('인프라')).toBeInTheDocument();
    expect(screen.getByText('EC2 t3.small 한 대로 시작')).toBeInTheDocument();
  });

  it('참가자 목록을 닉네임으로 노출한다', () => {
    render(
      <ReportDetail
        {...baseVm({
          report: baseDetail({
            participants: [
              {
                id: 'p1',
                nickname: '준',
                joinedAt: '2026-01-01T00:00:00.000Z',
                leftAt: '2026-01-01T01:00:00.000Z',
              },
              {
                id: 'p2',
                nickname: '아',
                joinedAt: '2026-01-01T00:05:00.000Z',
                leftAt: null,
              },
            ],
          }),
        })}
      />,
    );
    const section = screen.getByTestId('report-participants');
    expect(within(section).getByText('준')).toBeInTheDocument();
    expect(within(section).getByText('아')).toBeInTheDocument();
  });

  it('채팅 로그를 닉네임 + 본문으로 시간 순서대로 노출한다', () => {
    render(
      <ReportDetail
        {...baseVm({
          report: baseDetail({
            chat: [
              {
                nickname: '준',
                text: '안녕하세요',
                sentAt: '2026-01-01T00:01:00.000Z',
              },
              {
                nickname: '아',
                text: '반갑습니다',
                sentAt: '2026-01-01T00:02:00.000Z',
              },
            ],
          }),
        })}
      />,
    );
    const section = screen.getByTestId('report-chat');
    const messages = within(section).getAllByTestId('report-chat-entry');
    expect(messages).toHaveLength(2);
    expect(messages[0]).toHaveTextContent('준');
    expect(messages[0]).toHaveTextContent('안녕하세요');
    expect(messages[1]).toHaveTextContent('아');
  });
});
