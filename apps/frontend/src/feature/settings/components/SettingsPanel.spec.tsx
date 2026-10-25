import { fireEvent, render, screen } from '@testing-library/react';

import { useMeetingGuideStore } from '@/shared/stores/meeting-guide.store';
import { useThemeStore } from '@/shared/stores/theme.store';
import { useVideoQualityStore } from '@/shared/stores/video-quality.store';

import { SettingsDialog, SettingsPanel, ThemeSetting } from './SettingsPanel';

describe('ThemeSetting', () => {
  it('세 가지 선택지 중 현재 값이 선택돼 있다', () => {
    render(
      <ThemeSetting
        value="dark"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('radio', { name: '라이트' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: '다크' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '시스템' })).not.toBeChecked();
  });

  it('아이콘만 보이고 각 선택지의 이름은 툴팁으로 단다', () => {
    render(
      <ThemeSetting
        value="system"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('tooltip').map((t) => t.textContent)).toEqual([
      '라이트',
      '다크',
      '시스템',
    ]);
    expect(screen.getByRole('radiogroup', { name: '화면 테마' })).toBeInTheDocument();
  });

  it('다른 선택지를 누르면 그 값으로 onChange를 부른다', () => {
    const onChange = vi.fn();
    render(
      <ThemeSetting
        value="system"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: '라이트' }));
    expect(onChange).toHaveBeenCalledWith('light');
  });
});

describe('SettingsPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    useThemeStore.setState({ preference: 'system' });
  });

  it('테마를 고르면 화면에 바로 적용된다', () => {
    render(<SettingsPanel />);
    fireEvent.click(screen.getByRole('radio', { name: '다크' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('radio', { name: '다크' })).toBeChecked();
  });
});

describe('SettingsDialog', () => {
  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    render(
      <SettingsDialog
        isOpen={false}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('열리면 설정 패널을 담은 모달을 띄운다', () => {
    render(
      <SettingsDialog
        isOpen
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: '설정' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '시스템' })).toBeInTheDocument();
  });

  it('닫기 버튼·Escape·바깥 클릭으로 닫는다', () => {
    const onClose = vi.fn();
    render(
      <SettingsDialog
        isOpen
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '설정 닫기' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByTestId('settings-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe('SettingsPanel - 회의 화면 가이드', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useMeetingGuideStore.setState({ showMeetingGuide: true, isHydrated: false });
  });

  it('체크박스로 가이드 보기를 켜고 끈다', () => {
    render(<SettingsPanel />);
    const box = screen.getByRole('checkbox', { name: '회의 화면 가이드 보기' });
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(box).not.toBeChecked();
    expect(useMeetingGuideStore.getState().showMeetingGuide).toBe(false);
  });
});

describe('SettingsPanel - 영상 화질', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useVideoQualityStore.setState({ quality: 'auto' });
  });

  it('자동·데이터 절약·고화질 중 하나를 고른다', () => {
    render(<SettingsPanel />);
    const group = screen.getByRole('radiogroup', { name: '영상 화질' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '자동' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: '데이터 절약' }));
    expect(screen.getByRole('radio', { name: '데이터 절약' })).toBeChecked();
    expect(useVideoQualityStore.getState().quality).toBe('saver');
  });
});
