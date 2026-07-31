import { render, screen } from '@testing-library/react';

import { EmbedGate } from './EmbedGate';

const PAGE_URL = 'https://convene.example.com/meetings/ABC123';

describe('EmbedGate', () => {
  it('어느 회의인지 알 수 있도록 회의 코드를 보여준다', () => {
    render(
      <EmbedGate
        code="ABC123"
        pageUrl={PAGE_URL}
      />,
    );
    expect(screen.getByText('ABC123')).toBeInTheDocument();
  });

  it('회의 주소를 새 탭으로 여는 링크를 준다', () => {
    render(
      <EmbedGate
        code="ABC123"
        pageUrl={PAGE_URL}
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', PAGE_URL);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('새 탭이 opener를 통해 임베드 페이지를 조작하지 못하게 막는다', () => {
    render(
      <EmbedGate
        code="ABC123"
        pageUrl={PAGE_URL}
      />,
    );
    expect(screen.getByRole('link').getAttribute('rel')).toContain('noopener');
  });
});
