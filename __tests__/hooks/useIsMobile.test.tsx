import { renderHook, act } from '@testing-library/react';
import useIsMobile from '../../hooks/useIsMobile';

describe('useIsMobile', () => {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  let mobile = false;

  beforeEach(() => {
    listeners.clear();
    mobile = false;
    // @ts-ignore
    window.matchMedia = jest.fn().mockImplementation(() => ({
      matches: mobile,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
    }));
  });

  it('should detect mobile changes', () => {
    const { result } = renderHook(() => useIsMobile());
    expect(result.current[0]).toBe(false);
    act(() => {
      mobile = true;
      listeners.forEach((cb) => cb({ matches: true } as MediaQueryListEvent));
    });
    expect(result.current[0]).toBe(true);
  });
});
