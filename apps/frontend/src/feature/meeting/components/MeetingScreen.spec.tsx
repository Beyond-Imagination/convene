import { fireEvent, render, screen } from '@testing-library/react';

import type {
  RemoteParticipant,
  UseMeetingViewModel,
} from '@/feature/meeting/hooks/useMeetingViewModel';

import { MeetingScreen } from './MeetingScreen';

const baseVm = (overrides: Partial<UseMeetingViewModel> = {}): UseMeetingViewModel => ({
  code: 'abc12xyz',
  status: 'joined',
  nickname: '준',
  remoteParticipants: [],
  errorMessage: null,
  leave: vi.fn(),
  ...overrides,
});

describe('MeetingScreen View', () => {
  it('회의 코드와 내 닉네임을 헤더에 노출한다', () => {
    render(<MeetingScreen {...baseVm()} />);
    expect(screen.getByRole('heading', { name: /abc12xyz/ })).toBeInTheDocument();
    expect(screen.getByText(/내 닉네임: 준/)).toBeInTheDocument();
  });

  it('나(self) 참가자는 항상 한 줄로 표시된다', () => {
    render(<MeetingScreen {...baseVm()} />);
    expect(screen.getByTestId('self-participant')).toHaveTextContent('준 (나)');
  });

  it('원격 참가자 목록을 socketId 순서대로 렌더한다', () => {
    const remoteParticipants: RemoteParticipant[] = [
      { socketId: 's2', nickname: '아', joinedAt: '2026-01-01T00:01:00.000Z' },
      { socketId: 's3', nickname: '벤', joinedAt: '2026-01-01T00:02:00.000Z' },
    ];
    render(<MeetingScreen {...baseVm({ remoteParticipants })} />);
    const items = screen.getAllByTestId('remote-participant');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('아');
    expect(items[1]).toHaveTextContent('벤');
  });

  it('status="connecting" 이면 role="status" 로 안내 메시지', () => {
    render(<MeetingScreen {...baseVm({ status: 'connecting' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('연결 중');
  });

  it('status="error" + errorMessage 가 있으면 alert 로 노출', () => {
    render(
      <MeetingScreen {...baseVm({ status: 'error', errorMessage: 'handshake 실패' })} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('handshake 실패');
  });

  it('나가기 버튼 클릭 시 vm.leave 가 호출된다', () => {
    const leave = vi.fn();
    render(<MeetingScreen {...baseVm({ leave })} />);
    fireEvent.click(screen.getByRole('button', { name: '나가기' }));
    expect(leave).toHaveBeenCalledTimes(1);
  });
});
