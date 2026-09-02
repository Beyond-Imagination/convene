import { render, screen } from '@testing-library/react';

import { MeetingEntryBlocked } from './MeetingEntryBlocked';

describe('MeetingEntryBlocked', () => {
  it('없는 회의는 not-found로 표시하고 회의 코드를 함께 보여준다', () => {
    render(
      <MeetingEntryBlocked
        code="abc12xyz"
        status="not-found"
        message="존재하지 않는 회의입니다."
      />,
    );
    expect(screen.getByTestId('meeting-entry-blocked')).toHaveAttribute(
      'data-entry-block',
      'not-found',
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('abc12xyz')).toBeInTheDocument();
  });

  it('입장 실패는 없는 회의와 다른 상태로 표시한다', () => {
    render(
      <MeetingEntryBlocked
        code="abc12xyz"
        status="error"
        message={null}
      />,
    );
    expect(screen.getByTestId('meeting-entry-blocked')).toHaveAttribute(
      'data-entry-block',
      'failed',
    );
  });

  it('회의 화면 대신 홈으로 나가는 길을 준다', () => {
    render(
      <MeetingEntryBlocked
        code="abc12xyz"
        status="not-found"
        message={null}
      />,
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/');
  });
});
