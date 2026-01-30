import { renderHook, waitFor } from '@testing-library/react';
import { useAuth } from '../../hooks/useAuth';
import { serializeError } from '../../utils/errorSerialization';

jest.mock('../../utils/errorSerialization', () => ({
  serializeError: jest.fn(),
}));
jest.mock('next/router', () => ({
  useRouter: () => ({
    pathname: '/',
    push: jest.fn(),
  }),
}));

const mockSerializeError = serializeError as jest.MockedFunction<typeof serializeError>;

const originalFetch = global.fetch;

describe('useAuth hook', () => {
  beforeAll(() => {
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    mockSerializeError.mockReturnValue('Serialized auth error');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uses serializeError when authentication check fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Auth failed'));

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockSerializeError).toHaveBeenCalled();
    expect(result.current.error).toBe('Failed to check authentication status: Serialized auth error');

    consoleSpy.mockRestore();
  });
});
