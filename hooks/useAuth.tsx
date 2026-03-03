import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from 'react-query';

export interface AuthStatus {
  isAuthenticated: boolean;
  isLoading: boolean;
  user?: string;
  error?: string;
}

const AUTH_CHECK_QUERY_KEY = ['auth-check'];

const fetchAuthStatus = async (): Promise<AuthStatus> => {
  const response = await fetch('/api/auth-check', {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    return {
      isAuthenticated: false,
      isLoading: false,
      error: 'Authentication failed',
    };
  }

  const data = await response.json();
  return {
    isAuthenticated: true,
    isLoading: false,
    user: data.user,
  };
};

/**
 * Custom hook to check authentication status
 */
export function useAuth(): AuthStatus {
  const { data, isLoading, isError } = useQuery<AuthStatus>(AUTH_CHECK_QUERY_KEY, fetchAuthStatus, {
    staleTime: 0,
    cacheTime: 30000,
    retry: false,
  });

  if (isLoading) {
    return { isAuthenticated: false, isLoading: true };
  }

  if (isError || !data) {
    return {
      isAuthenticated: false,
      isLoading: false,
      error: 'Failed to check authentication status',
    };
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
