import { fireEvent, render, screen } from '@testing-library/react';

import type { UseChatViewModel } from '@/feature/meeting/hooks/useChatViewModel';

import { ChatPanel } from './ChatPanel';

const baseVm = (overrides: Partial<UseChatViewModel> = {}): UseChatViewModel => ({
  messages: [],
  canSend: true,
  draft: '',
  setDraft: vi.fn(),
  submit: vi.fn(),
  ...overrides,
});

describe('ChatPanel View', () => {
  it('메시지 목록을 닉네임+텍스트로 렌더한다', () => {
    render(
      <ChatPanel
        {...baseVm({
          messages: [
            { nickname: '준', text: '안녕', sentAt: '2026-01-01T00:01:00.000Z' },
            { nickname: '아', text: '하이', sentAt: '2026-01-01T00:01:05.000Z' },
          ],
        })}
      />,
    );
    const items = screen.getAllByTestId('chat-message');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('준');
    expect(items[0]).toHaveTextContent('안녕');
    expect(items[1]).toHaveTextContent('아');
    expect(items[1]).toHaveTextContent('하이');
  });

  it('myNickname 과 같은 보낸이는 내 메시지(data-mine=true), 다르면 false 로 구분한다', () => {
    render(
      <ChatPanel
        {...baseVm({
          messages: [
            { nickname: '준', text: '내거', sentAt: '2026-01-01T00:01:00.000Z' },
            { nickname: '아', text: '남거', sentAt: '2026-01-01T00:01:05.000Z' },
          ],
        })}
        myNickname="준"
      />,
    );
    const items = screen.getAllByTestId('chat-message');
    expect(items[0]).toHaveAttribute('data-mine', 'true');
    expect(items[1]).toHaveAttribute('data-mine', 'false');
  });

  it('canSend=false 면 input 과 버튼이 모두 비활성화된다', () => {
    render(<ChatPanel {...baseVm({ canSend: false })} />);
    expect(screen.getByLabelText('메시지')).toBeDisabled();
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled();
  });

  it('draft 가 빈 문자열이면 버튼은 비활성화된다 (전송 가능 상태와 무관)', () => {
    render(<ChatPanel {...baseVm({ canSend: true, draft: '' })} />);
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled();
  });

  it('draft 가 채워지면 버튼이 활성화되고 onChange 가 setDraft 호출', () => {
    const setDraft = vi.fn();
    render(<ChatPanel {...baseVm({ draft: '안녕', setDraft })} />);
    expect(screen.getByRole('button', { name: '보내기' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('메시지'), { target: { value: '하이' } });
    expect(setDraft).toHaveBeenCalledWith('하이');
  });

  it('폼 submit 시 vm.submit 호출 (페이지 reload 없음)', () => {
    const submit = vi.fn();
    render(<ChatPanel {...baseVm({ draft: '안녕', submit })} />);
    fireEvent.submit(screen.getByRole('form', { name: 'chat-form' }));
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
