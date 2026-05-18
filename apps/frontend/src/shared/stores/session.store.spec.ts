import { useSessionStore } from './session.store';

describe('useSessionStore', () => {
  beforeEach(() => {
    useSessionStore.setState({ nickname: null });
  });

  it('초기 nickname 은 null 이다', () => {
    expect(useSessionStore.getState().nickname).toBeNull();
  });

  it('setNickname 으로 닉네임을 저장한다', () => {
    useSessionStore.getState().setNickname('준');
    expect(useSessionStore.getState().nickname).toBe('준');
  });

  it('clearNickname 으로 닉네임을 비운다', () => {
    useSessionStore.getState().setNickname('준');
    useSessionStore.getState().clearNickname();
    expect(useSessionStore.getState().nickname).toBeNull();
  });

  it('setNickname 을 다시 호출하면 최신 값으로 덮어쓴다', () => {
    useSessionStore.getState().setNickname('준');
    useSessionStore.getState().setNickname('아');
    expect(useSessionStore.getState().nickname).toBe('아');
  });
});
