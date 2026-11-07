/* eslint-disable @next/next/no-img-element */
import TimeAgo from 'react-timeago';
import Link from 'next/link';
import Router from 'next/router';
import toast from 'react-hot-toast';
import Icon from '../common/Icon';
import { useUpdateDomainToggles } from '../../services/domains';
import { TOGGLE_TRACK_CLASS_NAME } from '../common/toggleStyles';
import { formatInZone } from '../../utils/timezone';
import { getAppTimezone } from '../../utils/client/appTimezone';
import { formatAveragePosition, roundAveragePosition } from '../../utils/averagePosition';

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

type TrendBadgeProps = {
   current: number,
   previous?: number | null,
   lowerIsBetter?: boolean,
}

const TrendBadge = ({ current, previous, lowerIsBetter = false }: TrendBadgeProps) => {
   if (typeof previous !== 'number' || !Number.isFinite(previous) || current === previous) {
      return null;
   }
   // For position metrics 0 means unranked, so a move to or from 0 is not an improvement or a drop
   if (lowerIsBetter && (current === 0 || previous === 0)) {
      return null;
   }
   const isUp = current > previous;
   const isGoodChange = lowerIsBetter ? !isUp : isUp;
   return (
      <span className={`ml-1 text-xs font-normal ${isGoodChange ? 'text-[#5ed7c3]' : 'text-red-300'}`}>
         {isUp ? '▲' : '▼'}
      </span>
   );
};

type DomainItemProps = {
   domain: DomainType,
   isConsoleIntegrated: boolean,
   thumb: string,
   updateThumb: (domain: string) => void,
   screenshotsEnabled?: boolean,
   showMapPackStat?: boolean,
}

const DomainItem = ({
   domain,
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

   const isDomainActive = Boolean(domain.scrapeEnabled);
   // Same whole-number rule as the email (utils/averagePosition)
   const avgPositionValue = roundAveragePosition(Number(avgPosition) || 0);

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
      } catch (_error) {
         // Error handling is done by mutation
      }
   };
   return (
      <div className='domItem bg-white border rounded w-full text-sm mb-10 hover:border-indigo-200'>
         {/* A div with a click handler instead of a wrapping anchor, so the checkbox and buttons are not nested inside a link.
             The domain name below is a real link for keyboard and new-tab use. */}
         <div
            className='flex flex-col md:max-lg:flex-row md:max-lg:flex-wrap lg:flex-row cursor-pointer'
            onClick={(event) => {
               const target = event.target as HTMLElement;
               if (target.closest('a, button, label, input')) { return; }
               Router.push(`/domain/${slug}`);
            }}
         >
            <div className={`flex-1 p-6 flex md:max-lg:basis-full ${!isConsoleIntegrated ? 'basis-1/3' : ''}`}>
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
                  <h3 className='font-semibold text-base mb-2 max-w-[200px] text-ellipsis overflow-hidden' title={domain.domain}>
                     <Link href={`/domain/${slug}`}>{domain.domain}</Link>
                  </h3>
                 <div className='flex items-center justify-between gap-3 text-xs text-gray-600'>
                    {keywordsUpdated ? (
                       <span>
                          Updated <TimeAgo title={formatInZone(keywordsUpdated, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }, getAppTimezone())} date={keywordsUpdated} />
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
                     <TrendBadge current={keywordsTracked} previous={domain.prevKeywordsTracked} />
                  </div>
                  <div className="flex-1 relative">
                     <span className='block text-xs lg:text-sm text-gray-500 mb-1'>Avg position</span>{formatAveragePosition(avgPositionValue)}
                     <TrendBadge
                        current={avgPositionValue}
                        previous={typeof domain.prevAvgPosition === 'number' ? roundAveragePosition(domain.prevAvgPosition) : domain.prevAvgPosition}
                        lowerIsBetter
                     />
                  </div>
                  {showMapPackStat && (
                     <div className="flex-1 relative">
                        <span className='block text-xs lg:text-sm text-gray-500 mb-1'>Map Pack</span>{mapPackKeywords}
                        <TrendBadge current={mapPackKeywords} previous={domain.prevMapPackKeywords} />
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
                        <TrendBadge current={scVisits} previous={domain.scVisitsPrev} />
                     </div>
                     <div className="flex-1 relative">
                        <span className='block text-xs lg:text-sm text-gray-500 mb-1'>Impressions</span>
                        {renderCompactMetric(scImpressions)}
                        <TrendBadge current={scImpressions} previous={domain.scImpressionsPrev} />
                     </div>
                     <div className="flex-1 relative">
                        <span className='block text-xs lg:text-sm text-gray-500 mb-1'>Avg position</span>
                        {scPosition}
                        <TrendBadge current={scPosition} previous={domain.scPositionPrev} lowerIsBetter />
                     </div>
                  </div>
               </div>
            )}
         </div>
      </div>
   );
};

export default DomainItem;
