import { renderHook } from '@testing-library/react';
import useOnKey from '../../hooks/useOnKey';

describe('useOnKey', () => {
  it('calls handler on specified key press', () => {
    const handler = jest.fn();
    renderHook(() => useOnKey('Escape', handler));
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    window.dispatchEvent(event);
    expect(handler).toHaveBeenCalled();
  });

  it('ignores other keys', () => {
    const handler = jest.fn();
    renderHook(() => useOnKey('Enter', handler));
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    window.dispatchEvent(event);
    expect(handler).not.toHaveBeenCalled();
  });
});
