import { renderHook } from '@testing-library/react';
import { useQuery } from 'react-query';
import { useAuth } from '../../hooks/useAuth';

jest.mock('react-query', () => ({
  useQuery: jest.fn(),
}));

describe('useAuth', () => {
  it('uses shared auth-check query key with short cache settings', () => {
    (useQuery as jest.Mock).mockReturnValue({ data: { isAuthenticated: true, isLoading: false, user: 'x' }, isLoading: false, isError: false });

    renderHook(() => useAuth());

    expect(useQuery).toHaveBeenCalledWith(
      ['auth-check'],
      expect.any(Function),
      expect.objectContaining({ staleTime: 10000, cacheTime: 30000, retry: false }),
    );
  });
});
