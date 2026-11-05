import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from 'react-query';
import { BrandTitle } from '../../components/common/Branding';
import { useBranding } from '../../hooks/useBranding';
import { AUTH_QUERY_KEY, type AuthStatus } from '../../hooks/useAuth';
import { apiPost, ApiError } from '../../utils/client/apiClient';

type LoginError = {
   type: string,
   msg: string,
}

const Login: NextPage = () => {
   const [error, setError] = useState<LoginError|null>(null);
   const [username, setUsername] = useState<string>('');
   const [password, setPassword] = useState<string>('');
   const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
   const router = useRouter();
   const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
   // Clearing the previous timer keeps an older timeout from hiding a newer error early
   const showError = (loginError: LoginError) => {
      if (errorTimerRef.current) { clearTimeout(errorTimerRef.current); }
      setError(loginError);
      errorTimerRef.current = setTimeout(() => { setError(null); errorTimerRef.current = null; }, 3000);
   };
   useEffect(() => () => { if (errorTimerRef.current) { clearTimeout(errorTimerRef.current); } }, []);
   const queryClient = useQueryClient();
   const { branding } = useBranding();
   const { platformName } = branding;

   const loginuser = async () => {
      if (isSubmitting) { return; }
      let loginError: LoginError |null = null;
      if (!username || !password) {
         if (!username && !password) {
            loginError = { type: 'empty_username_password', msg: 'Please Insert Your App Username & Password to login.' };
         }
         if (!username && password) {
            loginError = { type: 'empty_username', msg: 'Please Insert Your App Username' };
         }
         if (!password && username) {
            loginError = { type: 'empty_password', msg: 'Please Insert Your App Password' };
         }
         if (loginError) { showError(loginError); }
      } else {
         setIsSubmitting(true);
         try {
            await apiPost<{ success: boolean }>('/api/login', { username, password });
            // Write the authenticated state straight into the cache. A cached "logged out" entry
            // from before login would otherwise bounce the next protected page back to /login.
            queryClient.setQueryData<AuthStatus>(AUTH_QUERY_KEY, { isAuthenticated: true, isLoading: false });
            router.push('/');
         } catch (err) {
            const msg = err instanceof ApiError
               ? err.message
               : 'Network error: Unable to connect to the server.';
            // The backend returns a generic 'Invalid credentials' message intentionally
            // (prevents username enumeration), so no field-level error type is set here.
            showError({ type: '', msg });
            // On success the page navigates away, so the button stays disabled until then.
            setIsSubmitting(false);
         }
      }
   };

   const labelStyle = 'mb-2 font-semibold inline-block text-sm text-gray-700';
   const inputStyle = 'w-full p-2 border border-gray-200 rounded mb-3 focus:outline-none focus:border-blue-200';
   const errorBorderStyle = 'border-red-400 focus:border-red-400';
   return (
      <div className={'Login'}>
         <Head>
            <title>Login - {platformName}</title>
         </Head>
         <div className='flex items-center justify-center w-full min-h-screen overflow-y-auto'>
            <div className='w-80'>
               <h3 className="py-7 text-2xl font-bold text-blue-700 text-center">
                  <BrandTitle markSize={30} />
               </h3>
               <form
               className='relative bg-[white] rounded-md text-sm border p-5'
               onSubmit={(event) => { event.preventDefault(); loginuser(); }}>
                  <div className="settings__section__input mb-5">
                     <label className={labelStyle} htmlFor="login-username">Username</label>
                     <input
                        className={`
                           ${inputStyle} 
                           ${error && error.type.includes('username') ? errorBorderStyle : ''} 
                        `}
                        id="login-username"
                        type="text"
                        autoComplete="username"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                     />
                  </div>
                  <div className="settings__section__input mb-5">
                     <label className={labelStyle} htmlFor="login-password">Password</label>
                     <input
                        className={`
                           ${inputStyle} 
                           ${error && error.type.includes('password') ? errorBorderStyle : ''} 
                        `}
                        id="login-password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                     />
                  </div>
                  <button
                  type="submit"
                  disabled={isSubmitting}
                  className={'py-3 px-5 w-full rounded cursor-pointer bg-blue-700 text-white font-semibold text-sm disabled:cursor-not-allowed disabled:opacity-60'}>
                     {isSubmitting ? 'Logging in…' : 'Login'}
                  </button>
                  {error && error.msg
                  && <div
                     className={'absolute w-full bottom-[-100px] ml-[-20px] rounded text-center p-3 bg-red-100 text-red-600 text-sm font-semibold'}>
                        {error.msg}
                     </div>
                  }
               </form>
            </div>
         </div>

      </div>
   );
};

export default Login;
