import { render, screen } from '@testing-library/react';

import { MeetingEntryGate } from './MeetingEntryGate';

const blockState = (): string | null =>
  screen.getByTestId('meeting-entry-gate').getAttribute('data-entry-state');

describe('MeetingEntryGate', () => {
  it('판정 중에는 진행 상태만 보여주고 나가는 링크를 주지 않는다', () => {
    render(
      <MeetingEntryGate
        code="abc12xyz"
        state="checking"
      />,
    );
    expect(blockState()).toBe('checking');
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('없는 회의는 not-found로 표시하고 회의 코드를 함께 보여준다', () => {
    render(
      <MeetingEntryGate
        code="abc12xyz"
        state="not-found"
      />,
    );
    expect(blockState()).toBe('not-found');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('abc12xyz')).toBeInTheDocument();
  });

  it('종료된 회의는 closed로 표시하고 회의록으로 보낸다', () => {
    render(
      <MeetingEntryGate
        code="abc12xyz"
        state="closed"
      />,
    );
    expect(blockState()).toBe('closed');
    expect(screen.getByRole('link')).toHaveAttribute('href', '/reports');
  });

  it('원인을 모르는 실패는 ViewModel이 준 메시지를 그대로 보여준다', () => {
    render(
      <MeetingEntryGate
        code="abc12xyz"
        state="failed"
        message="회의에 입장하지 못했습니다. 링크가 유효한지 확인해 주세요."
      />,
    );
    expect(blockState()).toBe('failed');
    expect(screen.getByRole('link')).toHaveAttribute('href', '/');
    expect(
      screen.getByText('회의에 입장하지 못했습니다. 링크가 유효한지 확인해 주세요.'),
    ).toBeInTheDocument();
  });
});
