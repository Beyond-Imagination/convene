import { fireEvent, render, screen } from '@testing-library/react';

import type {
  RemoteParticipant,
  UseMeetingViewModel,
} from '@/feature/meeting/hooks/useMeetingViewModel';
import type { UseMediasoupViewModel } from '@/feature/meeting/hooks/useMediasoupViewModel';

import { MeetingScreen } from './MeetingScreen';

const baseMediasoup = (
  overrides: Partial<UseMediasoupViewModel> = {},
): UseMediasoupViewModel => ({
  status: 'ready',
  errorMessage: null,
  ...overrides,
});

const baseVm = (overrides: Partial<UseMeetingViewModel> = {}): UseMeetingViewModel => ({
  code: 'abc12xyz',
  status: 'joined',
  nickname: '준',
  remoteParticipants: [],
  errorMessage: null,
  leave: vi.fn(),
  ...overrides,
});

const renderScreen = (
  vmOverrides: Partial<UseMeetingViewModel> = {},
  mediasoupOverrides: Partial<UseMediasoupViewModel> = {},
) =>
  render(
    <MeetingScreen {...baseVm(vmOverrides)} mediasoup={baseMediasoup(mediasoupOverrides)} />,
  );

describe('MeetingScreen View', () => {
  it('회의 코드와 내 닉네임을 헤더에 노출한다', () => {
    renderScreen();
    expect(screen.getByRole('heading', { name: /abc12xyz/ })).toBeInTheDocument();
    expect(screen.getByText(/내 닉네임: 준/)).toBeInTheDocument();
  });

  it('나(self) 참가자는 항상 한 줄로 표시된다', () => {
    renderScreen();
    expect(screen.getByTestId('self-participant')).toHaveTextContent('준 (나)');
  });

  it('원격 참가자 목록을 socketId 순서대로 렌더한다', () => {
    const remoteParticipants: RemoteParticipant[] = [
      { socketId: 's2', nickname: '아', joinedAt: '2026-01-01T00:01:00.000Z' },
      { socketId: 's3', nickname: '벤', joinedAt: '2026-01-01T00:02:00.000Z' },
    ];
    renderScreen({ remoteParticipants });
    const items = screen.getAllByTestId('remote-participant');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('아');
    expect(items[1]).toHaveTextContent('벤');
  });

  it('status="connecting" 이면 role="status" 로 안내 메시지', () => {
    renderScreen({ status: 'connecting' });
    expect(screen.getByRole('status')).toHaveTextContent('연결 중');
  });

  it('status="error" + errorMessage 가 있으면 alert 로 노출', () => {
    renderScreen({ status: 'error', errorMessage: 'handshake 실패' });
    expect(screen.getByRole('alert')).toHaveTextContent('handshake 실패');
  });

  it('나가기 버튼 클릭 시 vm.leave 가 호출된다', () => {
    const leave = vi.fn();
    renderScreen({ leave });
    fireEvent.click(screen.getByRole('button', { name: '나가기' }));
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('mediasoup.status="preparing" 이면 미디어 준비 중 안내가 노출된다', () => {
    renderScreen({}, { status: 'preparing' });
    expect(screen.getByTestId('mediasoup-status')).toHaveTextContent('미디어 준비 중');
  });

  it('mediasoup.status="ready" 이면 준비 중 안내가 사라진다', () => {
    renderScreen({}, { status: 'ready' });
    expect(screen.queryByTestId('mediasoup-status')).toBeNull();
  });

  it('mediasoup.status="error" + errorMessage 가 있으면 미디어 오류가 alert 로 노출된다', () => {
    renderScreen({}, { status: 'error', errorMessage: 'no ice' });
    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((el) => el.textContent?.includes('미디어 오류'))).toBe(true);
    expect(alerts.some((el) => el.textContent?.includes('no ice'))).toBe(true);
  });
});
