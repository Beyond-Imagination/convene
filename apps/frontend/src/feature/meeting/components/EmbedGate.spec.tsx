import type { MeetingDetailResponse } from '@convene/shared-interfaces';
import { render, screen } from '@testing-library/react';

import { EmbedGate } from './EmbedGate';

const PAGE_URL = 'https://convene.example.com/meetings/abc12xyz';

const detail = (over: Partial<MeetingDetailResponse> = {}): MeetingDetailResponse => ({
  code: 'abc12xyz',
  title: '스프린트 회고',
  status: 'scheduled',
  participantCount: 0,
  startedAt: null,
  endedAt: null,
  ...over,
});

function renderGate(props: Partial<Parameters<typeof EmbedGate>[0]> = {}) {
  return render(
    <EmbedGate
      code="abc12xyz"
      pageUrl={PAGE_URL}
      status="ready"
      meeting={detail()}
      {...props}
    />,
  );
}

/** 카드는 로딩·오류·회의 상태를 하나의 축으로 노출한다. */
const cardStatus = (): string | null =>
  document.querySelector('[data-meeting-status]')?.getAttribute('data-meeting-status') ?? null;

describe('EmbedGate', () => {
  it('예약된 회의는 제목과 코드를 보여주고 참가 링크를 준다', () => {
    renderGate();
    expect(cardStatus()).toBe('scheduled');
    expect(screen.getByText('스프린트 회고')).toBeInTheDocument();
    expect(screen.getByText('abc12xyz')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', PAGE_URL);
  });

  it('진행 중인 회의는 현재 참가자 수를 보여준다', () => {
    renderGate({ meeting: detail({ status: 'open', participantCount: 3 }) });
    expect(cardStatus()).toBe('open');
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });

  it('종료된 회의는 참가 링크를 주지 않는다', () => {
    renderGate({ meeting: detail({ status: 'closed', endedAt: '2026-07-31T02:00:00.000Z' }) });
    expect(cardStatus()).toBe('closed');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('제목이 없는 회의도 코드로 식별할 수 있다', () => {
    renderGate({ meeting: detail({ title: null }) });
    expect(screen.getByText('abc12xyz')).toBeInTheDocument();
  });

  it('조회 중에는 참가 링크를 노출하지 않는다(상태를 모르는 채 입장 유도 금지)', () => {
    renderGate({ status: 'loading', meeting: null });
    expect(cardStatus()).toBe('loading');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('없는 회의면 참가 링크 대신 오류 상태를 보여준다', () => {
    renderGate({ status: 'error', meeting: null });
    expect(cardStatus()).toBe('error');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('참가 링크는 새 탭으로 열고 opener를 넘기지 않는다', () => {
    renderGate();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });
});
