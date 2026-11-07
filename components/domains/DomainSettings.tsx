import { useRouter } from 'next/router';
import React, { useMemo, useState, useRef, forwardRef, useEffect } from 'react';
import Icon from '../common/Icon';
import Modal from '../common/Modal';
import { useDeleteDomain, useFetchDomain, useUpdateDomain } from '../../services/domains';
import InputField from '../common/InputField';
import SelectField, { SelectionOption } from '../common/SelectField';
import { TOGGLE_TRACK_CLASS_NAME } from '../common/toggleStyles';
import { isValidEmail } from '../../utils/client/validators';
import SecretField from '../common/SecretField';
import { safeJsonParse } from '../../utils/safeJsonParse';

type DomainSettingsProps = {
   domain:DomainType|null,
   closeModal: (show: boolean) => void,
   availableScrapers?: SettingsType['available_scapers'],
   systemScraperType?: string,
}

type DomainSettingsError = {
   type: string,
   msg: string,
}

type DomainSettingsTab = 'notification' | 'searchconsole' | 'scraper';

const getTabClassName = (
   tab: DomainSettingsTab,
   currentTab: DomainSettingsTab,
   tabStyle: string
): string => `${tabStyle} ${currentTab === tab ? ' bg-white text-blue-600 border-slate-200' : 'border-transparent'}`;

const resolveSettingsError = (
   domainSettings: DomainSettings,
   hasStoredScraperKey: boolean
): DomainSettingsError | null => {
   if (domainSettings.notification_emails) {
      const emailList = domainSettings.notification_emails
         .split(',')
         .map((email) => email.trim())
         .filter((email) => email.length > 0);
      const invalidEmails = emailList.find((email) => !isValidEmail(email));
      if (invalidEmails) {
         return { type: 'email', msg: 'Invalid Email' };
      }
   }

   if (domainSettings.scraper_settings?.scraper_type) {
      const hasInput = typeof domainSettings.scraper_settings.scraping_api === 'string'
         && domainSettings.scraper_settings.scraping_api.trim().length > 0;
      // "Remove stored key" leaves the field blank on purpose: the save sends clear_api_key
      const isClearingKey = domainSettings.scraper_settings.clear_api_key === true;
      if (!hasInput && !hasStoredScraperKey && !isClearingKey) {
         return { type: 'scraper', msg: 'API key is required for the selected scraper.' };
      }
   }

   return null;
};

const showSettingsError = (
   error: DomainSettingsError,
   setSettingsError: React.Dispatch<React.SetStateAction<DomainSettingsError>>,
   setCurrentTab: React.Dispatch<React.SetStateAction<'notification' | 'searchconsole' | 'scraper'>>,
   errorTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>
) => {
   if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
   }
   setSettingsError(error);
   if (error.type === 'scraper') {
      setCurrentTab('scraper');
   }
   errorTimeoutRef.current = setTimeout(() => {
      setSettingsError({ type: '', msg: '' });
      errorTimeoutRef.current = null;
   }, 3000);
};

const deriveDomainActiveState = (domainData?: DomainType | null): boolean => {
   if (!domainData) { return true; }
   return Boolean(domainData.scrapeEnabled);
};

// The server sends this marker in place of a saved Search Console credential and keeps the stored value when it is sent back.
const SAVED_CREDENTIAL_MARKER = 'true';
const SAVED_CREDENTIAL_PLACEHOLDER = 'Saved. Type a new value to replace it.';
const isSavedCredential = (value?: string | null): boolean => value === SAVED_CREDENTIAL_MARKER;

const defaultSearchConsoleSettings: DomainSearchConsole = {
   property_type: 'domain',
   url: '',
   client_email: '',
   private_key: '',
};

const parseSearchConsoleSettings = (raw?: string | null): DomainSearchConsole => {
   const parsed = safeJsonParse<DomainSearchConsole | null>(raw, null);
   if (!parsed || typeof parsed !== 'object') {
      return { ...defaultSearchConsoleSettings };
   }
   return { ...defaultSearchConsoleSettings, ...parsed };
};

const DomainSettings = forwardRef<HTMLDivElement, DomainSettingsProps>(
   ({ domain, closeModal, availableScrapers = [], systemScraperType = '' }, ref) => {
      const settingsRef = useRef<HTMLDivElement>(null);
      const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
   const router = useRouter();
   const [currentTab, setCurrentTab] = useState<DomainSettingsTab>('notification');
   const [showRemoveDomain, setShowRemoveDomain] = useState<boolean>(false);
   const [settingsError, setSettingsError] = useState<DomainSettingsError>({ type: '', msg: '' });
   
   // Cleanup timeout on unmount
   useEffect(() => () => {
         if (errorTimeoutRef.current) {
            clearTimeout(errorTimeoutRef.current);
         }
      }, []);
   
   const initialActiveState = deriveDomainActiveState(domain);
   const initialScraperType = domain?.scraper_settings?.scraper_type ?? null;
   const initialScraperHasKey = domain?.scraper_settings?.has_api_key ?? false;
   const initialBusinessName = domain?.business_name ?? '';
   const [domainSettings, setDomainSettings] = useState<DomainSettings>(() => ({
      notification_emails: domain?.notification_emails ?? '',
      search_console: parseSearchConsoleSettings(domain?.search_console),
      scrapeEnabled: initialActiveState,
      scraper_settings: {
         scraper_type: initialScraperType,
         has_api_key: initialScraperHasKey,
         scraping_api: '',
      },
      business_name: initialBusinessName,
      scrape_strategy: (domain?.scrape_strategy as ScrapeStrategy | '' | undefined) ?? '',
      scrape_pagination_limit: domain?.scrape_pagination_limit ?? 0,
   }));

   const scraperOptions = useMemo(() => ([
      { label: 'System Scraper', value: '__system__' },
      ...availableScrapers.map((scraper) => ({ label: scraper.label, value: scraper.value })),
   ]), [availableScrapers]);

   const selectedScraperValues = domainSettings.scraper_settings?.scraper_type
      ? [domainSettings.scraper_settings.scraper_type]
      : ['__system__'];
   const hasScraperOverride = Boolean(domainSettings.scraper_settings?.scraper_type);
   const hasStoredScraperKey = domainSettings.scraper_settings?.has_api_key === true;
   const scraperKeyInput = domainSettings.scraper_settings?.scraping_api ?? '';
   const systemScraperLabel = useMemo(() => {
      if (!systemScraperType) { return ''; }
      const matched = availableScrapers.find((scraper) => scraper.value === systemScraperType);
      return matched?.label || systemScraperType;
   }, [availableScrapers, systemScraperType]);

   const { mutate: updateMutate, error: domainUpdateError, isLoading: isUpdating } = useUpdateDomain(() => closeModal(false));
   const { mutate: deleteMutate } = useDeleteDomain(() => { closeModal(false); router.push('/domains'); });

   // The form is seeded from the fetched domain once per domain, so a background refetch never wipes typed input
   const seededDomainRef = useRef<string | null>(null);
   // Get the Full Domain Data along with the Search Console API Data.
    const domainQuery = useFetchDomain(router, domain?.domain || '', (domainObj:DomainType) => {
      if (seededDomainRef.current === domainObj.domain) { return; }
      seededDomainRef.current = domainObj.domain;
      const currentSearchConsoleSettings = parseSearchConsoleSettings(domainObj.search_console);
      const nextActive = deriveDomainActiveState(domainObj);
      const fetchedScraperSettings = domainObj.scraper_settings || null;
      setDomainSettings(prevSettings => {
         const prevScraper = prevSettings.scraper_settings || { scraper_type: null, scraping_api: '', has_api_key: false };
         const nextScraper = {
            scraper_type: fetchedScraperSettings?.scraper_type ?? null,
            scraping_api: prevScraper.scraping_api ?? '',
            has_api_key: fetchedScraperSettings?.has_api_key ?? false,
         };
         return ({
            ...prevSettings,
            search_console: currentSearchConsoleSettings || prevSettings.search_console,
            scrapeEnabled: nextActive,
            scraper_settings: nextScraper,
            business_name: domainObj.business_name ?? prevSettings.business_name ?? '',
         });
      });
   });

   const updateDomainActiveState = (next: boolean) => {
      setDomainSettings(prevSettings => ({
         ...prevSettings,
         scrapeEnabled: next,
      }));
   };

   // Always treat scrapeEnabled as boolean in component state
   const isDomainActive = Boolean(domainSettings.scrapeEnabled);

   const handleScraperSelect = (updated: string[]) => {
      const nextValue = updated[0] || '__system__';
      const scraperType = nextValue === '__system__' ? null : nextValue;
      setDomainSettings(prevSettings => {
         const prevScraper = prevSettings.scraper_settings || { scraper_type: null, scraping_api: '', has_api_key: false };
         const keepExisting = prevScraper.scraper_type === scraperType;
         return ({
            ...prevSettings,
            scraper_settings: {
               scraper_type: scraperType,
               scraping_api: keepExisting ? prevScraper.scraping_api ?? '' : '',
               has_api_key: keepExisting ? prevScraper.has_api_key === true : false,
            },
         });
      });
   };

   const handleScraperKeyChange = (value: string) => {
      setDomainSettings(prevSettings => ({
         ...prevSettings,
         scraper_settings: {
            ...(prevSettings.scraper_settings || { scraper_type: null, has_api_key: false }),
            scraping_api: value,
         },
      }));
   };

   const handleRemoveStoredKey = () => {
      setDomainSettings(prevSettings => ({
         ...prevSettings,
         scraper_settings: {
            ...(prevSettings.scraper_settings || { scraper_type: null }),
            scraping_api: '',
            has_api_key: false,
            clear_api_key: true,
         },
      }));
   };

   const handleBusinessNameChange = (value: string) => {
      setDomainSettings(prevSettings => ({
         ...prevSettings,
         business_name: value,
      }));
   };

   const buildDomainSettingsPayload = (): Partial<DomainSettings> => {
      const { scraper_settings, business_name, scrape_strategy, scrape_pagination_limit, ...rest } = domainSettings;
      const payload: Partial<DomainSettings> = { ...rest };

      // Handle business_name separately
      const trimmedBusinessName = (business_name || '').trim();
      payload.business_name = trimmedBusinessName || null;

      // Handle strategy fields
      payload.scrape_strategy = scrape_strategy || '';
      payload.scrape_pagination_limit = scrape_pagination_limit || 0;

      if (scraper_settings) {
         const nextType = typeof scraper_settings.scraper_type === 'string' && scraper_settings.scraper_type
            ? scraper_settings.scraper_type
            : null;

         if (!nextType) {
            const systemScraperSettings: DomainScraperSettings = { scraper_type: null };
            payload.scraper_settings = systemScraperSettings;
         } else {
            const sanitized: DomainScraperSettings = { scraper_type: nextType };
            const trimmedKey = (scraper_settings.scraping_api || '').trim();
            if (trimmedKey) {
               sanitized.scraping_api = trimmedKey;
            }
            if (!trimmedKey && scraper_settings.clear_api_key) {
               sanitized.clear_api_key = true;
            }
            payload.scraper_settings = sanitized;
         }
      }

      return payload;
   };

   // Saving before the stored settings load would send the list's masked placeholders back, so Save waits for the load
   const isDomainLoading = domainQuery?.isLoading === true || domainQuery?.isError === true;

   const updateDomain = () => {
      if (isDomainLoading) { return; }
      const error = resolveSettingsError(domainSettings, hasStoredScraperKey);
      if (error && error.type) {
         showSettingsError(error, setSettingsError, setCurrentTab, errorTimeoutRef);
         return;
      }

      if (domain) {
         const payload = buildDomainSettingsPayload();
         updateMutate({ domainSettings: payload, domain });
      }
   };

   const renderSearchConsoleTab = () => (
      <>
                        <div className="mb-4 flex justify-between items-center w-full">
                           <label className='mb-2 font-semibold inline-block text-sm text-gray-700 capitalize'>Property Type</label>
                           <SelectField
                           options={[{ label: 'Domain', value: 'domain' }, { label: 'URL', value: 'url' }]}
                           selected={[domainSettings.search_console?.property_type || 'domain']}
                           defaultLabel="Select Search Console Property Type"
                           updateField={(updated: string[]) => setDomainSettings({
                              ...domainSettings,
                              search_console: { ...(domainSettings.search_console as DomainSearchConsole), property_type: (updated[0] || 'domain') as 'domain' | 'url' },
                           })}
                           multiple={false}
                           rounded={'rounded'}
                           />
                        </div>
                        {domainSettings?.search_console?.property_type === 'url' && (
                           <div className="mb-4 flex justify-between items-center w-full">
                              <InputField
                              label='Property URL (Required)'
                              onChange={(url:string) => setDomainSettings({
                                 ...domainSettings,
                                 search_console: { ...(domainSettings.search_console as DomainSearchConsole), url },
                              })}
                              value={domainSettings?.search_console?.url || ''}
                              placeholder='Search Console Property URL. eg: https://mywebsite.com/'
                              />
                           </div>
                        )}
                        <div className="mb-4 flex justify-between items-center w-full">
                           <InputField
                           label='Search Console Client Email'
                           onChange={(client_email:string) => setDomainSettings({
                              ...domainSettings,
                              search_console: { ...(domainSettings.search_console as DomainSearchConsole), client_email },
                           })}
                           value={isSavedCredential(domainSettings?.search_console?.client_email) ? '' : (domainSettings?.search_console?.client_email || '')}
                           placeholder={isSavedCredential(domainSettings?.search_console?.client_email) ? SAVED_CREDENTIAL_PLACEHOLDER : 'myapp@appspot.gserviceaccount.com'}
                           />
                        </div>
                        <div className="mb-4 flex flex-col justify-between items-center w-full">
                           <label className='mb-2 font-semibold block text-sm text-gray-700 capitalize w-full'>Search Console Private Key</label>
                           <textarea
                              className={`w-full p-2 border border-gray-200 rounded mb-3 text-xs 
                              focus:outline-none h-[100px] focus:border-blue-200`}
                              value={isSavedCredential(domainSettings?.search_console?.private_key) ? '' : (domainSettings?.search_console?.private_key || '')}
                              placeholder={isSavedCredential(domainSettings?.search_console?.private_key) ? SAVED_CREDENTIAL_PLACEHOLDER : '-----BEGIN PRIVATE KEY-----/ssssaswdkihad....'}
                              onChange={(event) => setDomainSettings({
                                 ...domainSettings,
                                 search_console: { ...(domainSettings.search_console as DomainSearchConsole), private_key: event.target.value },
                              })}
                           />
                        </div>
      </>
   );

   const tabStyle = `inline-block min-w-0 truncate whitespace-nowrap px-2 sm:px-4 py-2 rounded-md cursor-pointer text-xs sm:text-sm select-none z-10
                     text-gray-600 border border-b-0 relative top-[1px] rounded-b-none`;
   return (
   <div ref={ref || settingsRef}>
         <Modal closeModal={() => closeModal(false)} title={'Domain Settings'} width="[500px]" verticalCenter={currentTab === 'searchconsole'} >
            <div data-testid="domain_settings" className=" text-sm">
               <div className=' mt-3 mb-5 border  border-slate-200 px-2 py-4 pb-0
               relative left-[-20px] w-[calc(100%+40px)] border-l-0 border-r-0 bg-[#f8f9ff]'>
                  <ul className='flex gap-1'>
                     <li>
                     <button type="button" aria-pressed={currentTab === 'notification'} className={getTabClassName('notification', currentTab, tabStyle)}
                     onClick={() => setCurrentTab('notification')}>
                        <Icon type='email' /> Notification
                     </button>
                     </li>
                     <li>
                     <button type="button" aria-pressed={currentTab === 'searchconsole'} className={getTabClassName('searchconsole', currentTab, tabStyle)}
                     onClick={() => setCurrentTab('searchconsole')}>
                        <Icon type='google' /> Search Console
                     </button>
                     </li>
                     <li>
                     <button type="button" aria-pressed={currentTab === 'scraper'} className={getTabClassName('scraper', currentTab, tabStyle)}
                     onClick={() => setCurrentTab('scraper')}>
                        <Icon type='settings-alt' /> Scraper
                     </button>
                     </li>
                  </ul>
               </div>

               <div>
                  {currentTab === 'notification' && (
                     <>
                        <div className="mb-4 flex justify-between items-center w-full">
                           <InputField
                           label='Notification Emails'
                           onChange={(emails:string) => setDomainSettings({ ...domainSettings, notification_emails: emails })}
                           value={domainSettings.notification_emails || ''}
                           placeholder='Your Emails'
                           />
                        </div>
                        <p className='text-xs text-gray-500 mb-4 w-full text-left'>
                           Leave blank to turn off notification emails for this domain.
                        </p>
                     </>
                  )}
                  {currentTab === 'searchconsole' && renderSearchConsoleTab()}
                  {currentTab === 'scraper' && (
                     <>
                        <div className="mb-4 flex flex-col gap-3 w-full">
                           <label className='flex items-center justify-between gap-3 text-sm font-medium text-gray-700'>
                              <span>{isDomainActive ? 'Active' : 'Deactive'}</span>
                              <input
                                 type='checkbox'
                                 className='sr-only peer'
                                 checked={isDomainActive}
                                 value={isDomainActive.toString()}
                                 aria-label='Toggle domain active status'
                                 onChange={(event) => {
                                    event.preventDefault();
                                    updateDomainActiveState(!isDomainActive);
                                 }}
                              />
                              <div className={TOGGLE_TRACK_CLASS_NAME} />
                           </label>
                        </div>
                        <div className="mb-4 flex justify-between items-center w-full">
                           <label className='mb-2 font-semibold inline-block text-sm text-gray-700 capitalize'>Scraper</label>
                           <SelectField
                              options={scraperOptions}
                              selected={selectedScraperValues}
                              defaultLabel="Select Scraper"
                              updateField={(updated: string[]) => handleScraperSelect(updated)}
                              multiple={false}
                              rounded={'rounded'}
                              minWidth={210}
                           />
                        </div>
                        <div className="mb-4 flex flex-col items-start gap-2 w-full">
                           <SecretField
                              label='API Key'
                              value={scraperKeyInput}
                              onChange={handleScraperKeyChange}
                              placeholder={hasStoredScraperKey ? 'API key stored (leave blank to keep existing)' : 'Enter API key'}
                              disabled={!hasScraperOverride}
                              hasError={settingsError.type === 'scraper'}
                           />
                           {!hasScraperOverride && systemScraperLabel && (
                              <p className='text-xs text-gray-500 mt-2 w-full text-left'>
                                 Using system scraper: {systemScraperLabel}
                              </p>
                           )}
                           {hasScraperOverride && hasStoredScraperKey && !scraperKeyInput && (
                              <p className='text-xs text-gray-500 mt-2 w-full text-left'>
                                 An API key is already stored for this domain.
                              </p>
                           )}
                           {hasScraperOverride && hasStoredScraperKey && !scraperKeyInput && (
                              <button
                                 type='button'
                                 className='text-xs font-semibold text-red-500 hover:text-red-600'
                                 onClick={handleRemoveStoredKey}>
                                 Remove stored key
                              </button>
                           )}
                           {hasScraperOverride && !hasStoredScraperKey && domainSettings.scraper_settings?.clear_api_key && !scraperKeyInput && (
                              <p className='text-xs text-gray-500 mt-2 w-full text-left'>
                                 The stored key will be removed when you save. Enter a new key or switch to the system scraper.
                              </p>
                           )}
                        </div>
                        <div className="mb-4 flex justify-between items-center w-full">
                           <InputField
                           label='Business Name (Optional)'
                           onChange={(value:string) => handleBusinessNameChange(value)}
                           value={domainSettings.business_name || ''}
                           placeholder='e.g., Vontainment'
                           />
                        </div>
                        <div className="mb-4 flex justify-between items-center w-full">
                           <SelectField
                              label='Scrape Strategy Override'
                              options={([
                                 { label: 'Use Global Setting', value: '' },
                                 { label: 'Basic (First page only)', value: 'basic' },
                                 { label: 'Custom (Set number of pages)', value: 'custom' },
                              ] as SelectionOption[])}
                              selected={[domainSettings.scrape_strategy || '']}
                              defaultLabel="Use Global Setting"
                              updateField={(updated:string[]) => setDomainSettings({ ...domainSettings, scrape_strategy: (updated[0] || '') as ScrapeStrategy | '' })}
                              multiple={false}
                              rounded={'rounded'}
                              minWidth={210}
                           />
                        </div>
                        {domainSettings.scrape_strategy === 'custom' && (
                           <div className="mb-4 flex justify-between items-center w-full">
                              <SelectField
                                 label='Number of Pages to Scrape'
                                 options={([
                                    { label: 'Global default', value: '0' },
                                    ...Array.from({ length: 10 }, (_, i) => (
                                       { label: `${i + 1} Page${i > 0 ? 's' : ''}`, value: String(i + 1) }
                                    )),
                                 ] as SelectionOption[])}
                                 selected={[String(domainSettings.scrape_pagination_limit || 0)]}
                                 defaultLabel="Select Page Count"
                                 updateField={(updated:string[]) => updated[0] && setDomainSettings({ ...domainSettings, scrape_pagination_limit: parseInt(updated[0], 10) })}
                                 multiple={false}
                                 rounded={'rounded'}
                                 minWidth={210}
                              />
                           </div>
                        )}
                     </>
                  )}
               </div>
               {!isUpdating && (domainUpdateError as Error)?.message && (
                  <div className='w-full mt-4 p-3 text-sm bg-red-50 text-red-700'>{(domainUpdateError as Error).message}</div>
               )}
               {!isUpdating && settingsError?.msg && (
                  <div className='w-full mt-4 p-3 text-sm bg-red-50 text-red-700'>{settingsError.msg}</div>
               )}
            </div>

            <div className="flex justify-between border-t-[1px] border-gray-100 mt-8 pt-4 pb-0">
               <button
               className="text-sm font-semibold text-red-500"
               onClick={() => setShowRemoveDomain(true)}>
                  <Icon type="trash" /> Remove Domain
               </button>
               <button
               className={`text-sm font-semibold py-2 px-5 rounded bg-blue-700 text-white ${isUpdating || isDomainLoading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
               disabled={isDomainLoading}
               onClick={() => !isUpdating && updateDomain()}>
                  {isUpdating && <Icon type='loading' />} {isDomainLoading ? 'Loading…' : 'Update Settings'}
               </button>
            </div>
         </Modal>
         {showRemoveDomain && domain && (
            <Modal closeModal={() => setShowRemoveDomain(false) } title={`Remove Domain ${domain.domain}`}>
               <div className='text-sm'>
                  <p>Are you sure you want to remove this Domain? Removing this domain will remove all its keywords.</p>
                  <div className='mt-6 text-right font-semibold'>
                     <button
                     className=' py-1 px-5 rounded cursor-pointer bg-indigo-50 text-slate-500 mr-3'
                     onClick={() => setShowRemoveDomain(false)}>
                        Cancel
                     </button>
                     <button
                     className=' py-1 px-5 rounded cursor-pointer bg-red-400 text-white'
                     onClick={() => deleteMutate(domain)}>
                        Remove

                     </button>
                  </div>
               </div>
            </Modal>
         )}
      </div>
   );
   }
);
DomainSettings.displayName = 'DomainSettings';
export default DomainSettings;
