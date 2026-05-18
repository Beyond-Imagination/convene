import { render, screen } from '@testing-library/react';

describe('vitest + happy-dom + testing-library sanity', () => {
  it('단순 React 컴포넌트를 렌더하고 toBeInTheDocument matcher가 작동한다', () => {
    render(<h1>안녕</h1>);
    expect(screen.getByRole('heading', { name: '안녕' })).toBeInTheDocument();
  });
});
