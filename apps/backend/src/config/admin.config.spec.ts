import { resolveAdminConfig } from './admin.config';

describe('resolveAdminConfig', () => {
  it('ADMIN_API_TOKEN 이 없거나 비어 있으면 null(엔드포인트 비활성 신호)', () => {
    expect(resolveAdminConfig({})).toBeNull();
    expect(resolveAdminConfig({ ADMIN_API_TOKEN: '' })).toBeNull();
    expect(resolveAdminConfig({ ADMIN_API_TOKEN: '   ' })).toBeNull();
  });

  it('ADMIN_API_TOKEN 이 있으면 trim 한 token 을 돌려준다', () => {
    expect(resolveAdminConfig({ ADMIN_API_TOKEN: '  secret-123  ' })).toEqual({
      token: 'secret-123',
    });
  });
});
