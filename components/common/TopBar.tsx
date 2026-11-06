import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useQueryClient } from 'react-query';
import Icon from './Icon';
import { BrandTitle } from './Branding';
import { apiPost, ApiError } from '../../utils/client/apiClient';

type TopbarProps = {
   showSettings: () => void,
   showAddModal: () => void,
}

const TopBar = ({ showSettings, showAddModal }:TopbarProps) => {
   const [showMobileMenu, setShowMobileMenu] = useState<boolean>(false);
   const router = useRouter();
   const queryClient = useQueryClient();
   const isDomainsPage = router.pathname === '/domains';

   const logoutUser = async () => {
      try {
         await apiPost('/api/logout', {});
         // Drop all cached server state (auth, domains, settings) so no data from the previous session survives
         queryClient.clear();
         router.push('/login');
      } catch (err) {
         const message = err instanceof ApiError ? err.message : 'Failed to log out. Please try again.';
         toast(message, { icon: '⚠️' });
      }
   };

   return (
      <div className='topbar bg-white'>
      <div className='desktop-container flex items-center justify-between'>

         <div className='flex items-center gap-2 h-16'>
            <h3
               className='flex items-center gap-3 p-4 text-base font-bold text-blue-700'
            >
               <BrandTitle
                  className="text-base font-bold text-blue-700"
                  markSize={64}
                  markClassName="mr-2"
               />
               <button type='button' aria-label='Add Domain' className='px-3 py-1 font-bold text-blue-700 lg:hidden text-lg' onClick={() => showAddModal()}>+</button>
            </h3>
            {!isDomainsPage && (
               <Link
                  href={'/domains'}
                  className='topbar__back px-2 py-1 cursor-pointer bg-[#ecf2ff] hover:bg-indigo-100 transition-all
                  lg:px-3 lg:py-2 rounded-full'
               >
                  <Icon type="caret-left" size={16} title="Go Back" />
               </Link>
            )}
         </div>
         <div className="topbar__right">
            <button type='button' aria-label='Toggle menu' className={' lg:hidden p-3'} onClick={() => setShowMobileMenu(!showMobileMenu)}>
               <Icon type="hamburger" size={24} />
            </button>
            <ul
               className={`text-sm font-semibold text-gray-500 absolute mt-0 right-3 bg-white
               border border-gray-200 lg:mt-2 lg:relative lg:block lg:border-0 lg:bg-transparent ${showMobileMenu ? 'block z-50' : 'hidden'}`}
            >
               <li className={`block lg:inline-block lg:ml-5 ${router.asPath === '/domains' ? ' text-blue-700' : ''}`}>
                  <Link href={'/domains'} className='block px-3 py-2 cursor-pointer'>
                     <Icon type="domains" color={router.asPath === '/domains' ? '#1d4ed8' : '#888'} size={14} /> Domains
                  </Link>
               </li>
               <li className={`block lg:inline-block lg:ml-5 ${router.asPath === '/research' ? ' text-blue-700' : ''}`}>
                  <Link href={'/research'} className='block px-3 py-2 cursor-pointer'>
                     <Icon type="research" color={router.asPath === '/research' ? '#1d4ed8' : '#888'} size={14} /> Research
                  </Link>
               </li>
               <li className='block lg:inline-block lg:ml-5'>
                  <button type='button' className='block px-3 py-2 cursor-pointer font-semibold' onClick={() => showSettings()}>
                     <Icon type="settings-alt" color={'#888'} size={14} /> Settings
                  </button>
               </li>
               <li className='block lg:inline-block lg:ml-5'>
                  <a className='block px-3 py-2 cursor-pointer' href='https://docs.serpbear.com/' target="_blank" rel='noreferrer'>
                     <Icon type="question" color={'#888'} size={14} /> Help
                  </a>
               </li>
               <li className='block lg:inline-block lg:ml-5'>
                  <button type='button' className='block px-3 py-2 cursor-pointer font-semibold' onClick={() => logoutUser()}>
                     <Icon type="logout" color={'#888'} size={14} /> Logout
                  </button>
               </li>
            </ul>
         </div>
      </div>
      </div>
   );
 };

 export default TopBar;
