import { fireEvent, render, screen } from '@testing-library/react';

import { MeetingGuide, type MeetingGuideProps } from './MeetingGuide';

const props = (overrides: Partial<MeetingGuideProps> = {}): MeetingGuideProps => ({
  isActive: true,
  step: { id: 'chat', title: '채팅', body: '회의 중에 메시지를 주고받아요.' },
  index: 1,
  total: 4,
  rect: { top: 600, left: 500, width: 80, height: 50 },
  next: vi.fn(),
  prev: vi.fn(),
  skip: vi.fn(),
  ...overrides,
});

describe('MeetingGuide', () => {
  it('꺼져 있으면 아무것도 그리지 않는다', () => {
    render(<MeetingGuide {...props({ isActive: false })} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('지금 단계의 제목·설명과 위치를 보여 준다', () => {
    render(<MeetingGuide {...props()} />);
    expect(screen.getByRole('dialog', { name: '채팅' })).toBeInTheDocument();
    expect(screen.getByText('회의 중에 메시지를 주고받아요.')).toBeInTheDocument();
    expect(screen.getByText('2 / 4')).toBeInTheDocument();
  });

  it('이전·다음·건너뛰기 버튼이 해당 동작을 부른다', () => {
    const p = props();
    render(<MeetingGuide {...p} />);
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));
    expect(p.next).toHaveBeenCalledTimes(1);
    expect(p.prev).toHaveBeenCalledTimes(1);
    expect(p.skip).toHaveBeenCalledTimes(1);
  });

  it('첫 단계에는 이전 버튼이 없고, 마지막 단계는 다음 대신 완료다', () => {
    const { rerender } = render(<MeetingGuide {...props({ index: 0 })} />);
    expect(screen.queryByRole('button', { name: '이전' })).not.toBeInTheDocument();
    rerender(<MeetingGuide {...props({ index: 3 })} />);
    expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '완료' })).toBeInTheDocument();
  });

  it('Escape 를 누르면 건너뛴다', () => {
    const p = props();
    render(<MeetingGuide {...p} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(p.skip).toHaveBeenCalledTimes(1);
  });
});
