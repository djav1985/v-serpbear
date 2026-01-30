import type { NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { BrandTitle } from '../../components/common/Branding';
import { useBranding } from '../../hooks/useBranding';
import { getClientOrigin } from '../../utils/client/origin';
import { serializeError } from '../../utils/errorSerialization';

type LoginError = {
   type: string,
   msg: string,
}

const Login: NextPage = () => {
   const [error, setError] = useState<LoginError|null>(null);
   const [username, setUsername] = useState<string>('');
   const [password, setPassword] = useState<string>('');
   const router = useRouter();
   const { branding } = useBranding();
   const { platformName } = branding;

   const loginuser = async () => {
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
         setError(loginError);
         setTimeout(() => { setError(null); }, 3000);
      } else {
         try {
            const header = new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' });
            const fetchOpts = { method: 'POST', headers: header, body: JSON.stringify({ username, password }) };
            const origin = getClientOrigin();
            const fetchRoute = `${origin}/api/login`;
            const res = await fetch(fetchRoute, fetchOpts).then((result) => result.json());
            // console.log(res);
            if (!res.success) {
               let errorType = '';
               if (res.error && res.error.toLowerCase().includes('username')) {
                   errorType = 'incorrect_username';
               }
               if (res.error && res.error.toLowerCase().includes('password')) {
                   errorType = 'incorrect_password';
               }
               setError({ type: errorType, msg: res.error });
               setTimeout(() => { setError(null); }, 3000);
            } else {
               router.push('/');
            }
         } catch (fetchError) {
            console.error('Login request failed:', fetchError);
            const message = serializeError(fetchError);
            setError({ type: 'network_error', msg: `Network error: ${message}` });
            setTimeout(() => { setError(null); }, 3000);
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
               <div className='relative bg-[white] rounded-md text-sm border p-5'>
                  <div className="settings__section__input mb-5">
                     <label className={labelStyle}>Username</label>
                     <input
                        className={`
                           ${inputStyle} 
                           ${error && error.type.includes('username') ? errorBorderStyle : ''} 
                        `}
                        type="text"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                     />
                  </div>
                  <div className="settings__section__input mb-5">
                     <label className={labelStyle}>Password</label>
                     <input
                        className={`
                           ${inputStyle} 
                           ${error && error.type.includes('password') ? errorBorderStyle : ''} 
                        `}
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                     />
                  </div>
                  <button
                  onClick={() => loginuser()}
                  className={'py-3 px-5 w-full rounded cursor-pointer bg-blue-700 text-white font-semibold text-sm'}>
                     Login
                  </button>
                  {error && error.msg
                  && <div
                     className={'absolute w-full bottom-[-100px] ml-[-20px] rounded text-center p-3 bg-red-100 text-red-600 text-sm font-semibold'}>
                        {error.msg}
                     </div>
                  }
               </div>
            </div>
         </div>

      </div>
   );
};

export default Login;
