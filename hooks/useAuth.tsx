import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from 'react-query';

export interface AuthStatus {
  isAuthenticated: boolean;
  isLoading: boolean;
  user?: string;
  error?: string;
}

export const AUTH_QUERY_KEY = ['auth-check'] as const;
// Re-check after 5 minutes; keep result cached for 10 minutes to avoid repeated network calls
const AUTH_STALE_TIME = 5 * 60 * 1000;
const AUTH_CACHE_TIME = 10 * 60 * 1000;

async function fetchAuthStatus(): Promise<AuthStatus> {
  const response = await fetch('/api/auth-check', {
    method: 'GET',
    credentials: 'include',
  });
  if (response.ok) {
    const data = await response.json();
    return { isAuthenticated: true, isLoading: false, user: data.user };
  }
  return { isAuthenticated: false, isLoading: false, error: 'Authentication failed' };
}

/**
 * Custom hook to check authentication status.
 * Uses a shared React Query key so multiple components share a single network request.
 */
export function useAuth(): AuthStatus {
  const { data, isLoading, isError } = useQuery<AuthStatus>(
    AUTH_QUERY_KEY,
    fetchAuthStatus,
    {
      staleTime: AUTH_STALE_TIME,
      cacheTime: AUTH_CACHE_TIME,
      retry: false,
      refetchOnWindowFocus: false,
    },
  );

  if (isLoading) {
    return { isAuthenticated: false, isLoading: true };
  }
  if (isError || !data) {
    return { isAuthenticated: false, isLoading: false, error: 'Failed to check authentication status' };
  }
  return data;
}

/**
 * Custom hook for protected pages - redirects to login if not authenticated
 */
export function useAuthRequired(): AuthStatus {
  const router = useRouter();
  const authStatus = useAuth();

  useEffect(() => {
    if (!authStatus.isLoading && !authStatus.isAuthenticated) {
      // Only redirect if we're not already on the login page
      if (router.pathname !== '/login') {
        router.push('/login');
      }
    }
  }, [authStatus.isAuthenticated, authStatus.isLoading, router]);

  return authStatus;
}

/**
 * Higher-order component to protect pages with authentication
 */
export function withAuth<P extends Record<string, any>>(
  WrappedComponent: React.ComponentType<P>
): React.ComponentType<P> {
  const AuthenticatedComponent: React.ComponentType<P> = (props) => {
    const { isAuthenticated, isLoading, error } = useAuthRequired();

    // Show loading while checking authentication
    if (isLoading) {
      return (
        <div className="flex items-center justify-center w-full min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Checking authentication...</p>
          </div>
        </div>
      );
    }

    // Show error if authentication check failed
    if (error) {
      return (
        <div className="flex items-center justify-center w-full min-h-screen">
          <div className="text-center">
            <p className="text-red-600 mb-4">Authentication Error</p>
            <p className="text-gray-600">{error}</p>
          </div>
        </div>
      );
    }

    // Only render the component if authenticated
    if (isAuthenticated) {
      return <WrappedComponent {...props} />;
    }

    // This should not happen due to redirect in useAuthRequired, but just in case
    return null;
  };

  AuthenticatedComponent.displayName = `withAuth(${WrappedComponent.displayName || WrappedComponent.name})`;

  return AuthenticatedComponent;
}

export default useAuth;