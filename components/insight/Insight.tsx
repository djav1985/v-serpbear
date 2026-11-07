import React, { useState } from 'react';
import { sortInsightItems } from '../../utils/insight';
import SelectField from '../common/SelectField';
import InsightItem from './InsightItem';
import InsightStats from './InsightStats';
import SpinnerMessage from '../common/SpinnerMessage';
import { formatDateKey } from '../../utils/timezone';

type SCInsightProps = {
   domain: DomainType | null,
   insight: InsightDataType,
   isLoading: boolean,
   isError?: boolean,
   isConsoleIntegrated: boolean,
}

const SCInsight = ({ insight, isLoading = true, isError = false, isConsoleIntegrated = true, domain }: SCInsightProps) => {
   const [activeTab, setActiveTab] = useState<string>('stats');

   const insightItems = insight[activeTab as keyof InsightDataType];
   const startDate = insight && insight.stats && insight.stats.length > 0 ? insight.stats[0].date : null;
   const endDate = insight && insight.stats && insight.stats.length > 0 ? insight.stats[insight.stats.length - 1].date : null;

   const switchTab = (tab: string) => {
      setActiveTab(tab);
   };

   const renderTableHeader = () => {
      const headerNames: {[key:string]: string[]} = {
         stats: ['Date', 'Avg Position', 'Visits', 'Impressions', 'CTR'],
         keywords: ['Keyword', 'Avg Position', 'Visits ↑', 'Impressions', 'CTR', 'Countries'],
         countries: ['Country', 'Avg Position', 'Visits ↑', 'Impressions', 'CTR', 'Keywords'],
         pages: ['Page', 'Avg Position', 'Visits ↑', 'Impressions', 'CTR', 'Countries', 'Keywords'],
      };

      return (
         <div className={`domKeywords_head hidden lg:flex p-3 px-6 bg-[#FCFCFF]
            text-gray-600 justify-between items-center font-semibold border-y`}>
            <span className='domKeywords_head_keyword flex-1 basis-20 w-auto '>{headerNames[activeTab][0]}</span>
            <span className='domKeywords_head_position flex-1 basis-40 grow-0 text-center'>{headerNames[activeTab][1]}</span>
            <span className='domKeywords_head_imp flex-1 text-center'>{headerNames[activeTab][2]}</span>
            <span className='domKeywords_head_visits flex-1 text-center'>{headerNames[activeTab][3]}</span>
            <span className='domKeywords_head_ctr flex-1 text-center'>{headerNames[activeTab][4]}</span>
            {headerNames[activeTab][5] && <span className='domKeywords_head_ctr flex-1 text-center'>{headerNames[activeTab][5]}</span>}
            {headerNames[activeTab][6] && <span className='domKeywords_head_ctr flex-1 text-center'>{headerNames[activeTab][6]}</span>}
         </div>
      );
   };

   const deviceTabStyle = 'select-none cursor-pointer px-3 py-2 rounded-3xl mr-2';
   const deviceTabCountStyle = 'px-2 py-0 rounded-3xl bg-[#DEE1FC] text-[0.7rem] font-bold ml-1';

   return (
      <div>
         <div className='domKeywords flex flex-col bg-[white] rounded-md text-sm border mb-5'>
            <div className='domKeywords_filters py-4 px-6 flex flex-col justify-between
            text-sm text-gray-500 font-semibold border-b-[1px] lg:border-0 lg:flex-row'>
               <div>
                  <ul className='text-xs hidden lg:flex'>
                     {['stats', 'keywords', 'countries', 'pages'].map((tabItem) => {
                        const tabInsightItem = insight[tabItem as keyof InsightDataType];
                        return <li key={`tab-${tabItem}`}>
                        <button type="button" aria-pressed={activeTab === tabItem}
                        className={`${deviceTabStyle} ${activeTab === tabItem ? ' bg-[#F8F9FF] text-gray-700' : ''}`}
                        onClick={() => switchTab(tabItem)}>
                              <i className='hidden not-italic lg:inline-block ml-1 capitalize'>{tabItem}</i>
                              {tabItem !== 'stats' && (
                                 <span className={`${deviceTabCountStyle}`}>
                                    {tabInsightItem && tabInsightItem.length ? tabInsightItem.length : 0}
                                 </span>
                              )}
                        </button>
                        </li>;
                     })}
                  </ul>
                  <div className='insight_selector lg:hidden'>
                     <SelectField
                     options={['stats', 'keywords', 'countries', 'pages'].map((d) => ({ label: d, value: d }))}
                     selected={[activeTab]}
                     defaultLabel="Select Tab"
                     updateField={(updatedTab: string[]) => switchTab(updatedTab[0])}
                     multiple={false}
                     rounded={'rounded'}
                     />
                  </div>
               </div>
               {isConsoleIntegrated && (<div className='py-2 text-xs text-center mt-2 lg:text-sm lg:mt-0'>
                  {startDate && formatDateKey(startDate, { dateStyle: 'medium' })}
                  <span className='px-2 inline-block'>-</span>
                  {endDate && formatDateKey(endDate, { dateStyle: 'medium' })}
                  <span className='ml-2'>(Last 30 Days)</span>
               </div>
               )}
            </div>
            {isConsoleIntegrated && activeTab === 'stats' && (
               <InsightStats
               stats={insight?.stats ? insight.stats : []}
               totalKeywords={insight?.keywords?.length || 0}
               totalPages={insight?.pages?.length || 0}
               />
            )}

            <div className='domkeywordsTable domkeywordsTable--sckeywords styled-scrollbar w-full overflow-auto min-h-[60vh]'>
               <div className=' lg:min-w-[800px]'>
                  {renderTableHeader()}
                  <div className='domKeywords_keywords border-gray-200 min-h-[55vh] relative'>
                     {['keywords', 'pages', 'countries', 'stats'].includes(activeTab) && insight && insightItems
                           && (activeTab === 'stats' ? [...insightItems].reverse() : sortInsightItems(insightItems)).map(
                              (item:SCInsightItem, index: number) => {
                              const insightItemCount = insight ? insightItems : [];
                              const lastItem = !!(insightItemCount && (index === insightItemCount.length - 1));
                              return <InsightItem key={index} item={item} type={activeTab} lastItem={lastItem} domain={domain?.domain || ''} />;
                           },
                        )
                     }
                     {isConsoleIntegrated && isLoading && (
                        <SpinnerMessage className='p-9 pt-[10%] text-center' label='Loading insights' />
                     )}
                     {isConsoleIntegrated && !isLoading && isError && (
                        <p role="alert" className='p-9 pt-[10%] text-center text-red-600'>Unable to load Search Console insights. Please try again.</p>
                     )}
                     {isConsoleIntegrated && !isLoading && !isError && (!insightItems || insightItems.length === 0) && (
                        <p className='p-9 pt-[10%] text-center text-gray-500'>No Search Console insight data is available for this view.</p>
                     )}
                     {!isConsoleIntegrated && (
                        <p className=' p-9 pt-[10%] text-center text-gray-500'>
                        Google Search Console has not been Integrated yet. Please follow <a className='text-indigo-600 underline' href='https://docs.serpbear.com/miscellaneous/integrate-google-search-console' target="_blank" rel='noreferrer'>These Steps</a> to integrate Google Search Data for this Domain.
                        </p>
                     )}
                  </div>
               </div>
            </div>
         </div>
      </div>
   );
 };

 export default SCInsight;
