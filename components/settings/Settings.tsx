/// <reference path="../../types.d.ts" />

import React, { forwardRef, useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useFetchSettings, useUpdateSettings } from '../../services/settings';
import { getClientOrigin } from '../../utils/client/origin';
import Icon from '../common/Icon';
import NotificationSettings from './NotificationSettings';
import ScraperSettings from './ScraperSettings';
import useOnKey from '../../hooks/useOnKey';
import IntegrationSettings from './IntegrationSettings';
import { DEFAULT_BRANDING } from '../../utils/branding';
import { useBranding } from '../../hooks/useBranding';
import { closeOnBGClick } from '../../utils/client/closeOnBGClick';

type SettingsProps = {
   closeSettings: () => void,
}

type SettingsError = {
   type: string,
   msg: string
}

const createDefaultSettings = (platformName: string): SettingsType => ({
   scraper_type: 'none',
   scrape_delay: 'none',
   scrape_retry: false,
   notification_interval: 'daily',
   smtp_server: '',
   smtp_port: '',
   smtp_tls_servername: '',
   smtp_username: '',
   smtp_password: '',
   notification_email_from: '',
   notification_email_from_name: platformName,
   search_console_client_email: '',
   search_console_private_key: '',
   keywordsColumns: ['Best', 'History', 'Volume', 'Search Console'],
});

export const defaultSettings: SettingsType = createDefaultSettings(DEFAULT_BRANDING.platformName);

const Settings = forwardRef<HTMLDivElement, SettingsProps>(({ closeSettings }:SettingsProps, ref) => {
   const { branding } = useBranding();
   const [currentTab, setCurrentTab] = useState<string>('scraper');
   const [settings, setSettings] = useState<SettingsType>(defaultSettings);
   const [settingsError, setSettingsError] = useState<SettingsError|null>(null);
   const errorTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
   const { mutateAsync: updateMutateAsync, isLoading: isUpdating } = useUpdateSettings(() => {});
   const { data: appSettings, isLoading, refetch: refetchSettings } = useFetchSettings();
   
   // Cleanup timeout on unmount
   useEffect(() => () => {
         if (errorTimeoutRef.current) {
            clearTimeout(errorTimeoutRef.current);
         }
      }, []);
   useOnKey('Escape', closeSettings);

   // Local edits must survive background refetches, so the server copy is only seeded on the first
   // successful load and again after a successful save (see performUpdate).
   const seedPendingRef = React.useRef(true);
   useEffect(() => {
      if (appSettings && appSettings.settings && seedPendingRef.current) {
         seedPendingRef.current = false;
         setSettings(appSettings.settings);
      }
   }, [appSettings]);

   // The Google Ads OAuth result arrives while the drawer is open (postMessage from the auth tab).
   // The ?ads= redirect fallback is handled by pages/domains/index.tsx so it runs even with the drawer closed.
   // The OAuth callback has already stored the new token on the server, so a refetch picks it up.
   const handleAdwordsResult = useCallback((status: string | null | undefined, detail?: string | null) => {
      if (status === 'success') {
         toast('Google Ads has been integrated successfully!', { icon: '✔️' });
         refetchSettings()
            .then((result) => {
               const serverSettings = result.data?.settings;
               if (serverSettings) {
                  // Merge only the Google Ads fields so unsaved edits elsewhere in the drawer survive
                  setSettings((current) => ({
                     ...current,
                     adwords_client_id: serverSettings.adwords_client_id,
                     adwords_client_secret: serverSettings.adwords_client_secret,
                     adwords_refresh_token: serverSettings.adwords_refresh_token,
                     adwords_developer_token: serverSettings.adwords_developer_token,
                     adwords_account_id: serverSettings.adwords_account_id,
                  }));
               }
            })
            .catch(() => {
               // Silently handle refetch errors
            });
      } else {
         toast(detail || 'Google Ads integration failed. Please try again.', { icon: '⚠️' });
      }
   }, [refetchSettings]);

   useEffect(() => {
      if (typeof window === 'undefined') { return undefined; }
      const expectedOrigin = getClientOrigin();

      const handleIntegrationMessage = (event: MessageEvent) => {
         if (event.origin !== expectedOrigin) { return; }
         const data = event.data as { type?: string; status?: string; message?: string };
         if (!data || data.type !== 'adwordsIntegrated') { return; }
         handleAdwordsResult(data.status, data.message);
      };

      window.addEventListener('message', handleIntegrationMessage);
      return () => {
         window.removeEventListener('message', handleIntegrationMessage);
      };
   }, [handleAdwordsResult]);

   useEffect(() => {
      if (!appSettings?.settings) {
         setSettings((currentSettings) => {
            if (currentSettings.notification_email_from_name === DEFAULT_BRANDING.platformName
               && branding.platformName !== DEFAULT_BRANDING.platformName) {
               return {
                  ...currentSettings,
                  notification_email_from_name: branding.platformName,
               };
            }
            return currentSettings;
         });
      }
   }, [appSettings?.settings, branding.platformName]);

   const updateSettings = (key: string, value:string|number|boolean) => {
      setSettings((current) => ({ ...current, [key]: value }));
   };

   const performUpdate = async () => {
      let error: null|SettingsError = null;
      const sanitizedSettings: SettingsType = { ...settings };

      Object.entries(sanitizedSettings).forEach(([key, value]) => {
         if (typeof value === 'string') {
            (sanitizedSettings as Record<string, unknown>)[key] = value.trim();
         }
      });

      setSettings(sanitizedSettings);

      const {
         notification_interval,
         notification_email_from,
         scraper_type,
         smtp_port,
         smtp_server,
         scraping_api,
      } = sanitizedSettings;
      if (notification_interval !== 'never') {
         // Recipients are set per domain, so only the SMTP details are checked here
         if (!smtp_port || !smtp_server || !notification_email_from) {
               let type = 'no_smtp_from';
               if (!smtp_port) { type = 'no_smtp_port'; }
               if (!smtp_server) { type = 'no_smtp_server'; }
               error = { type, msg: 'Insert SMTP Server details that will be used to send the emails.' };
         }
      }

      if (scraper_type !== 'none' && !scraping_api) {
         error = { type: 'no_api_key', msg: 'Insert a Valid API Key or Token for the Scraper Service.' };
      }

      if (error) {
         if (errorTimeoutRef.current) {
            clearTimeout(errorTimeoutRef.current);
         }
         setSettingsError(error);
         errorTimeoutRef.current = setTimeout(() => {
            setSettingsError(null);
            errorTimeoutRef.current = null;
         }, 3000);
         return false;
      } else {
         // Perform Update
         const previousScraperType = appSettings?.settings?.scraper_type;
         // The refresh token is written by the Google OAuth callback on the server. Sending this page's copy
         // back could overwrite a newer token (for example right after re-authorising) with a stale one,
         // so it is left out and the server keeps the stored token.
         const { adwords_refresh_token: _storedRefreshToken, ...settingsToSave } = sanitizedSettings;
         try {
            await updateMutateAsync(settingsToSave as SettingsType);
         } catch (_updateError) {
            // useUpdateSettings already shows an error toast; keep the local edits
            return false;
         }
         seedPendingRef.current = true;
         // If Scraper is updated, refresh the page when enabling from a disabled state.
         if (previousScraperType === 'none' && scraper_type !== 'none') {
            window.location.reload();
         }
      }
      return true;
   };

   const tabStyle = `inline-block px-3 py-2 rounded-md  cursor-pointer text-xs lg:text-sm lg:mr-3 lg:px-4 select-none z-10
   text-gray-600 border border-b-0 relative top-[1px] rounded-b-none`;
   const tabStyleActive = 'bg-white text-blue-600 border-slate-200';

   return (
       <div ref={ref} className="settings fixed w-full h-dvh top-0 left-0 z-[9999]" onClick={(e) => closeOnBGClick(e, closeSettings)}>
            <div role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title" className="absolute w-full max-w-md bg-white customShadow top-0 right-0 h-dvh flex flex-col" data-loading={isLoading} >
               {isLoading && <div className='absolute flex content-center items-center h-full'><Icon type="loading" size={24} /></div>}
               <div className='flex-1 overflow-y-auto'>
               <div className='settings__header px-5 py-4 text-slate-500'>
                  <h3 id="settings-dialog-title" className=' text-black text-lg font-bold'>Settings</h3>
                  <button
                  type="button"
                  aria-label="Close settings"
                  className=' absolute top-2 right-2 p-2 px- text-gray-400 hover:text-gray-700 transition-all hover:rotate-90'
                  onClick={() => closeSettings()}>
                     <Icon type='close' size={24} />
                  </button>
               </div>
               <div className='border border-slate-200 px-3 py-4 pb-0 border-l-0 border-r-0 bg-[#f8f9ff]'>
                  <ul>
                     <li><button type="button" aria-pressed={currentTab === 'scraper'} className={`${tabStyle} ${currentTab === 'scraper' ? tabStyleActive : 'border-transparent '}`} onClick={() => setCurrentTab('scraper')}>
                       <Icon type='scraper' /> Scraper
                     </button></li>
                     <li><button type="button" aria-pressed={currentTab === 'notification'} className={`${tabStyle} ${currentTab === 'notification' ? tabStyleActive : 'border-transparent'}`} onClick={() => setCurrentTab('notification')}>
                        <Icon type='email' /> Notification
                     </button></li>
                     <li><button type="button" aria-pressed={currentTab === 'integrations'} className={`${tabStyle} ${currentTab === 'integrations' ? tabStyleActive : 'border-transparent'}`} onClick={() => setCurrentTab('integrations')}>
                       <Icon type='integration' size={14} /> Integrations
                     </button></li>
                  </ul>
               </div>
               {currentTab === 'scraper' && settings && (
                  <ScraperSettings settings={settings} updateSettings={updateSettings} settingsError={settingsError} />
               )}

               {currentTab === 'notification' && settings && (
                  <NotificationSettings settings={settings} updateSettings={updateSettings} settingsError={settingsError} />
               )}
               {currentTab === 'integrations' && settings && (
                  <IntegrationSettings
                  settings={settings}
                  updateSettings={updateSettings}
                  settingsError={settingsError}
                  performUpdate={performUpdate}
                  closeSettings={closeSettings}
                   />
               )}
               </div>
               <div className='border-t border-gray-200 px-6 py-4'>
                  <button
                  onClick={() => performUpdate()}
                  className=' py-3 px-5 w-full rounded cursor-pointer bg-blue-700 text-white font-semibold text-sm'>
                  {isUpdating && <Icon type="loading" size={14} />} Update Settings
                  </button>
               </div>
            </div>
       </div>
   );
});

Settings.displayName = 'Settings';

export default Settings;
