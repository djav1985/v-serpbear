/* eslint-disable @next/next/no-img-element */
// import { useRouter } from 'next/router';
// import { useState } from 'react';
import TimeAgo from 'react-timeago';
import dayjs from 'dayjs';
import Link from 'next/link';
import toast from 'react-hot-toast';
import Icon from '../common/Icon';
import { useUpdateDomainToggles } from '../../services/domains';
import { TOGGLE_TRACK_CLASS_NAME } from '../common/toggleStyles';

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
   notation: 'compact',
   compactDisplay: 'short',
});

const formatCompactNumber = (value: number) => {
   const parts = COMPACT_NUMBER_FORMATTER.formatToParts(value);
   const unit = parts.find((part) => part.type === 'compact')?.value || '';
   const numeric = parts
      .filter((part) => part.type !== 'compact')
      .map((part) => part.value)
      .join('')
      .trim() || '0';

   return { numeric, unit };
};

type DomainItemProps = {
   domain: DomainType,
   selected: boolean,
   isConsoleIntegrated: boolean,
   thumb: string,
   updateThumb: Function,
   screenshotsEnabled?: boolean,
   showMapPackStat?: boolean,
}

const DomainItem = ({
   domain,
   selected,
   isConsoleIntegrated = false,
   thumb,
   updateThumb,
   screenshotsEnabled = true,
   showMapPackStat = false,
}: DomainItemProps) => {
   const {
      keywordsUpdated,
      slug,
      keywordsTracked = 0,
      avgPosition = 0,
      scVisits = 0,
      scImpressions = 0,
      scPosition = 0,
      mapPackKeywords = 0,
   } = domain;
   const { mutateAsync: updateDomainToggle, isLoading: isToggleUpdating } = useUpdateDomainToggles();

   const isDomainActive = domain.scrapeEnabled === 1 && domain.notification === 1;

   const renderCompactMetric = (value: number) => {
      const { numeric, unit } = formatCompactNumber(value);
      return (
         <span className='whitespace-nowrap'>
            {numeric}
            {unit && <span className='ml-1 text-xs font-normal text-gray-500'>{unit}</span>}
         </span>
      );
   };

   const handleDomainStatusToggle = async (nextValue: boolean) => {
      const payload: Partial<DomainSettings> = { scrapeEnabled: nextValue };
      try {
         await updateDomainToggle({ domain, domainSettings: payload });
         const message = `${domain.domain} ${nextValue ? 'marked as Active' : 'marked as Deactive'}.`;
         toast(message, { icon: '✔️' });
      } catch (error) {
         console.log('Error updating domain toggle', error);
      }
   };
   // const router = useRouter();
   return (
      <div className={`domItem bg-white border rounded w-full text-sm mb-10 hover:border-indigo-200 ${selected ? '' : ''}`}>
         <Link href={`/domain/${slug}`} className='flex flex-col lg:flex-row'>
            <div className={`flex-1 p-6 flex ${!isConsoleIntegrated ? 'basis-1/3' : ''}`}>
               <div className="group domain_thumb w-20 h-20 mr-6 bg-slate-100 rounded
                  border border-gray-200 overflow-hidden flex justify-center relative">
                  {screenshotsEnabled && (
                     <button
                        className=' absolute right-1 top-0 text-gray-400 p-1 transition-all
                        invisible opacity-0 group-hover:visible group-hover:opacity-100 hover:text-gray-600 z-10'
                        title='Reload Website Screenshot'
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateThumb(domain.domain); }}
                     >
                        <Icon type="reload" size={12} />
                     </button>
                  )}
                  <img
                  className={`self-center ${!thumb ? 'max-w-[50px]' : ''}`}
                  src={thumb || `https://www.google.com/s2/favicons?domain=${domain.domain}&sz=128`} alt={domain.domain}
                  />
               </div>
               <div className="domain_details flex-1">
                  <h3 className='font-semibold text-base mb-2 max-w-[200px] text-ellipsis overflow-hidden' title={domain.domain}>{domain.domain}</h3>
                 <div className='flex items-center justify-between gap-3 text-xs text-gray-600'>
                    {keywordsUpdated ? (
                       <span>
                          Updated <TimeAgo title={dayjs(keywordsUpdated).format('DD-MMM-YYYY, hh:mm:ss A')} date={keywordsUpdated} />
                       </span>
                    ) : (
                       <span>Status</span>
                    )}
                    <label
                       className={`relative inline-flex items-center cursor-pointer gap-2 ${isToggleUpdating ? 'opacity-70 cursor-not-allowed' : ''}`}
                       onClick={(event) => { event.stopPropagation(); }}
                    >
                       <span className='font-medium text-gray-700'>{isDomainActive ? 'Active' : 'Deactive'}</span>
                       <input
                          type='checkbox'
                          className='sr-only peer'
                          checked={isDomainActive}
                          value={isDomainActive.toString()}
                          aria-label='Toggle domain active status'
                          onChange={(event) => {
                             event.preventDefault();
                             event.stopPropagation();
                             if (isToggleUpdating) { return; }
                             handleDomainStatusToggle(!isDomainActive);
                          }}
                          disabled={isToggleUpdating}
                       />
                       <div className={TOGGLE_TRACK_CLASS_NAME} />
                    </label>
                 </div>
              </div>
           </div>
            <div className='flex-1 flex flex-col p-4'>
               <div className=' bg-indigo-50 p-1 px-2 text-xs rounded-full absolute ml-3 mt-[-8px]'>
                  <Icon type="tracking" size={13} color="#364aff" /> Tracker
               </div>
               <div className='dom_stats flex flex-1 font-semibold text-2xl p-4 pt-5 rounded border border-[#E9EBFF] text-center'>
                  <div className="flex-1 relative">
                     <span className='block text-xs lg:text-sm text-gray-500 mb-1'>Keywords</span>{keywordsTracked}
                  </div>
                  <div className="flex-1 relative">
                     <span className='block text-xs lg:text-sm text-gray-500 mb-1'>Avg position</span>{avgPosition}
                  </div>
                  {showMapPackStat && (
                     <div className="flex-1 relative">
                        <span className='block text-xs lg:text-sm text-gray-500 mb-1'>Map Pack</span>{mapPackKeywords}
                     </div>
                  )}
               </div>
            </div>
            {isConsoleIntegrated && (
               <div className='flex-1 flex-col p-4 lg:basis-56'>
                  <div className=' bg-indigo-50 p-1 px-2 text-xs rounded-full absolute ml-3 mt-[-8px]'>
                     <Icon type="google" size={13} /> Search Console (7d)
                  </div>
                  <div className='dom_sc_stats flex flex-1 h-full font-semibold text-2xl p-4 pt-5 rounded border border-[#E9EBFF] text-center'>
                     <div className="flex-1 relative">
                        <span className='block text-xs lg:text-sm text-gray-500 mb-1'>Visits</span>
                        {renderCompactMetric(scVisits)}
                     </div>
                     <div className="flex-1 relative">
                        <span className='block text-xs lg:text-sm text-gray-500 mb-1'>Impressions</span>
                        {renderCompactMetric(scImpressions)}
                     </div>
                     <div className="flex-1 relative">
                        <span className='block text-xs lg:text-sm text-gray-500 mb-1'>Avg position</span>
                        {scPosition}
                     </div>
                  </div>
               </div>
            )}
         </Link>
      </div>
   );
};

export default DomainItem;
