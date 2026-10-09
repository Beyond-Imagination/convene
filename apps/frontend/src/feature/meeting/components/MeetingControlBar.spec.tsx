import { REACTION_KINDS } from '@convene/shared-interfaces';
import { fireEvent, render, screen } from '@testing-library/react';

import type { UseMediasoupViewModel } from '@/feature/meeting/hooks/useMediasoupViewModel';

import { MeetingControlBar, type MeetingControlBarProps } from './MeetingControlBar';

const baseMediasoup = (): UseMediasoupViewModel => ({
  status: 'ready',
  errorMessage: null,
  localStream: null,
  remoteMedia: [],
  isSharingScreen: false,
  screenStream: null,
  isRemoteSharingScreen: false,
  isAudioMuted: false,
  isVideoMuted: false,
  isAudioToggling: false,
  toggleAudio: vi.fn(),
  toggleVideo: vi.fn(),
  startScreenShare: vi.fn(async () => {}),
  stopScreenShare: vi.fn(),
});

const baseReaction = (
  overrides: Partial<NonNullable<MeetingControlBarProps['reaction']>> = {},
): NonNullable<MeetingControlBarProps['reaction']> => ({
  canReact: true,
  isPickerOpen: false,
  togglePicker: vi.fn(),
  closePicker: vi.fn(),
  react: vi.fn(),
  ...overrides,
});

const renderBar = (overrides: Partial<MeetingControlBarProps> = {}) =>
  render(
    <MeetingControlBar
      mediasoup={baseMediasoup()}
      isHost={false}
      leave={vi.fn()}
      endMeeting={vi.fn(async () => {})}
      reaction={baseReaction()}
      isHandRaised={false}
      onToggleHand={vi.fn()}
      {...overrides}
    />,
  );

describe('MeetingControlBar 반응', () => {
  it('reaction이 없으면 반응 버튼을 그리지 않는다', () => {
    renderBar({ reaction: undefined });
    expect(screen.queryByRole('button', { name: /반응/ })).not.toBeInTheDocument();
  });

  it('반응 버튼은 picker를 여닫는다', () => {
    const reaction = baseReaction();
    renderBar({ reaction });
    const button = screen.getByRole('button', { name: /반응/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(reaction.togglePicker).toHaveBeenCalledTimes(1);
  });

  it('picker가 닫혀 있으면 이모지를 보여 주지 않는다', () => {
    renderBar();
    expect(screen.queryByRole('button', { name: '빵빠레' })).not.toBeInTheDocument();
  });

  it('picker가 열리면 모든 리액션 이모지를 보여 주고, 누르면 그 종류로 react 한다', () => {
    const reaction = baseReaction({ isPickerOpen: true });
    renderBar({ reaction });
    expect(screen.getByRole('group', { name: '리액션' }).querySelectorAll('button')).toHaveLength(
      REACTION_KINDS.length,
    );
    fireEvent.click(screen.getByRole('button', { name: '빵빠레' }));
    expect(reaction.react).toHaveBeenCalledWith('party');
  });

  it('보낼 수 없는 상태면 이모지 버튼이 비활성화된다', () => {
    renderBar({ reaction: baseReaction({ isPickerOpen: true, canReact: false }) });
    expect(screen.getByRole('button', { name: '빵빠레' })).toBeDisabled();
  });

  it('picker의 손들기 토글은 현재 상태에 맞는 라벨로 onToggleHand를 부른다', () => {
    const onToggleHand = vi.fn();
    const { rerender } = renderBar({
      reaction: baseReaction({ isPickerOpen: true }),
      onToggleHand,
    });
    fireEvent.click(screen.getByRole('button', { name: /손들기/ }));
    expect(onToggleHand).toHaveBeenCalledTimes(1);

    rerender(
      <MeetingControlBar
        mediasoup={baseMediasoup()}
        isHost={false}
        leave={vi.fn()}
        endMeeting={vi.fn(async () => {})}
        reaction={baseReaction({ isPickerOpen: true })}
        isHandRaised
        onToggleHand={onToggleHand}
      />,
    );
    expect(screen.getByRole('button', { name: /손 내리기/ })).toBeInTheDocument();
  });

  it('손을 든 상태는 picker가 닫혀 있어도 반응 버튼 이름으로 알린다', () => {
    renderBar({ isHandRaised: true });
    expect(screen.getByRole('button', { name: /손 든 상태/ })).toBeInTheDocument();
  });

  it('Escape나 바깥 클릭은 picker를 닫는다', () => {
    const reaction = baseReaction({ isPickerOpen: true });
    renderBar({ reaction });
    fireEvent.keyDown(screen.getByRole('group', { name: '리액션' }), { key: 'Escape' });
    fireEvent.click(screen.getByTestId('reaction-backdrop'));
    expect(reaction.closePicker).toHaveBeenCalledTimes(2);
  });
});
