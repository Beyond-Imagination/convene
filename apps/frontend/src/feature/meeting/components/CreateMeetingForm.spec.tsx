import { fireEvent, render, screen } from '@testing-library/react';

import { CreateMeetingForm } from './CreateMeetingForm';

describe('CreateMeetingForm View', () => {
  it('status="idle" 이면 버튼은 활성화되고 "회의 만들기" 라벨을 노출한다', () => {
    render(<CreateMeetingForm status="idle" errorMessage={null} onSubmit={() => {}} />);
    const button = screen.getByRole('button', { name: '회의 만들기' });
    expect(button).toBeEnabled();
  });

  it('status="submitting" 이면 버튼은 비활성화되고 "생성 중…" 라벨을 노출한다', () => {
    render(<CreateMeetingForm status="submitting" errorMessage={null} onSubmit={() => {}} />);
    const button = screen.getByRole('button', { name: '생성 중…' });
    expect(button).toBeDisabled();
  });

  it('status="error" + errorMessage 가 있으면 role="alert" 로 노출된다', () => {
    render(
      <CreateMeetingForm status="error" errorMessage="잘못된 요청" onSubmit={() => {}} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('잘못된 요청');
  });

  it('status="idle" 일 때 errorMessage 가 있어도 alert 는 노출하지 않는다', () => {
    render(
      <CreateMeetingForm status="idle" errorMessage="이전 실패" onSubmit={() => {}} />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('버튼 클릭 시 onSubmit 콜백을 한 번 호출한다', () => {
    const onSubmit = vi.fn();
    render(<CreateMeetingForm status="idle" errorMessage={null} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: '회의 만들기' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
