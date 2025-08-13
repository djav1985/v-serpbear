import { renderHook, act } from '@testing-library/react';
import useWindowResize from '../../hooks/useWindowResize';

describe('useWindowResize', () => {
  it('invokes callback on mount and resize', () => {
    const handler = jest.fn();
    renderHook(() => useWindowResize(handler));
    expect(handler).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
