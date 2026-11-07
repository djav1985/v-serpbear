import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import Icon from '../common/Icon';
import countries from '../../utils/countries';
import Chart from '../common/Chart';
import SelectField from '../common/SelectField';
import { useFetchSingleKeyword } from '../../services/keywords';
import useOnKey from '../../hooks/useOnKey';
import { generateTheChartData } from '../../utils/client/generateChartData';
import { formatInZone } from '../../utils/timezone';
import { getAppTimezone } from '../../utils/client/appTimezone';
import { closeOnBGClick } from '../../utils/client/closeOnBGClick';
import { safeHttpUrl } from '../../utils/client/safeUrl';
import MapPackBadge from './MapPackBadge';

type KeywordDetailsProps = {
   keyword: KeywordType,
   closeDetails: () => void
}

const KeywordDetails = ({ keyword, closeDetails }:KeywordDetailsProps) => {
   const updatedDate = keyword.lastUpdated ? formatInZone(keyword.lastUpdated, { month: 'long', day: 'numeric', year: 'numeric' }, getAppTimezone()) : '';
   const [chartTime, setChartTime] = useState<string>('30');
   const searchResultContainer = useRef<HTMLDivElement>(null);
   const searchResultFound = useRef<HTMLDivElement>(null);
   const { data: keywordData } = useFetchSingleKeyword(keyword.ID);
   const keywordHistory: KeywordHistory = keywordData?.history || keyword.history;
   const fallbackResults = Array.isArray(keyword.lastResult) ? keyword.lastResult : [];
   const keywordSearchResultRaw = keywordData?.searchResult;
   const keywordSearchResult: KeywordLastResult[] = Array.isArray(keywordSearchResultRaw)
      ? keywordSearchResultRaw
      : fallbackResults;
   const fallbackLocalResults = Array.isArray(keyword.localResults) ? keyword.localResults : [];
   const keywordLocalResultsRaw = keywordData?.localResults;
   const keywordLocalResults: KeywordLocalResult[] = Array.isArray(keywordLocalResultsRaw)
      ? keywordLocalResultsRaw
      : fallbackLocalResults;
   const mapPackTop3 = Boolean(keywordData?.mapPackTop3 ?? keyword.mapPackTop3);
   const mapPackRemovedAt = keywordData?.mapPackRemovedAt ?? keyword.mapPackRemovedAt ?? null;
   const dateOptions = [
      { label: 'Last 7 Days', value: '7' },
      { label: 'Last 30 Days', value: '30' },
      { label: 'Last 90 Days', value: '90' },
      { label: '1 Year', value: '360' },
      { label: 'All Time', value: 'all' },
   ];

   useOnKey('Escape', closeDetails);

   const chartData = useMemo(() => generateTheChartData(keywordHistory, chartTime), [keywordHistory, chartTime]);

   // Stored results are contiguous, so the count is the number of results checked.
   // The 'No Results' fallback only triggers when there are no results yet.
   const scrapedCount = Array.isArray(keywordSearchResult) ? keywordSearchResult.length : 0;
   const notFoundLabel = scrapedCount > 0 ? `Not in First ${scrapedCount}` : 'No Results';

   useLayoutEffect(() => {
      if (keyword.position > 0 && searchResultFound?.current) {
         searchResultFound.current.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'start',
         });
      }
   }, [keywordSearchResult, keyword.position]);

   return (
       <div className="keywordDetails fixed w-full h-dvh top-0 left-0 z-[99999]" onClick={(e) => closeOnBGClick(e, closeDetails)} data-testid="keywordDetails">
            <div className="keywordDetails absolute w-full lg:w-5/12 bg-white customShadow top-0 right-0 h-dvh overflow-y-auto" >
               <div className='keywordDetails__header p-6 border-b border-b-slate-200 text-slate-600'>
                  <h3 className=' text-lg font-bold flex items-center'>
                     <span className="fflag-stack mr-2">
                        <span
                           title={countries[keyword.country]?.[0] ?? keyword.country}
                           className={`fflag fflag-${keyword.country} w-[18px] h-[12px]`}
                        />
                        <MapPackBadge inMapPack={mapPackTop3} removedAt={mapPackRemovedAt} />
                     </span>
                     <span>{keyword.keyword}</span>
                     <span
                     className={`py-1 px-2 ml-2 rounded bg-blue-50 ${keyword.position === 0 ? 'text-gray-500' : 'text-blue-700'}  text-xs font-bold`}>
                        {keyword.position === 0 ? notFoundLabel : keyword.position}
                     </span>
                  </h3>
                  <button
                  className='absolute top-2 right-2 p-2 px-3 text-gray-400 hover:text-gray-700 transition-all hover:rotate-90'
                  onClick={() => closeDetails()}>
                     <Icon type='close' size={24} />
                  </button>
               </div>
               <div className='keywordDetails__content p-6'>

                  <div className='keywordDetails__section'>
                     <div className="keywordDetails__section__head flex justify-between mb-5">
                        <h3 className=' font-bold text-gray-700 text-lg'>SERP History</h3>
                        <div className="keywordDetails__section__chart_select mr-3">
                           <SelectField
                           options={dateOptions}
                           selected={[chartTime]}
                           defaultLabel="Select Date"
                           updateField={(updatedTime: string[]) => setChartTime(updatedTime[0])}
                           multiple={false}
                           rounded={'rounded'}
                           />
                        </div>
                     </div>
                     <div className='keywordDetails__section__chart h-64'>
                           <Chart labels={chartData.labels} series={chartData.series} />
                     </div>
                  </div>
                  <div className='keywordDetails__section mt-10'>
                     <div className="keywordDetails__section__head flex justify-between items-center pb-4 mb-4 border-b border-b-slate-200">
                        <h3 className=' font-bold text-gray-700 lg:text-lg'>Local Search Results</h3>
                        <span className=' text-xs text-gray-500'>{updatedDate}</span>
                     </div>
                     <div className='keywordDetails__section__results keywordDetails__section__results--local styled-scrollbar overflow-y-auto max-md:overflow-y-visible'>
                        {keywordLocalResults && Array.isArray(keywordLocalResults) && keywordLocalResults.length > 0 ? (
                           keywordLocalResults.map((item, index) => {
                              const position = item.position || index + 1;
                              const title = item.title || (item.name as string | undefined) || `Local Result ${position}`;
                              const rawUrl = item.url || (item.website as string | undefined) || (item.link as string | undefined) || (item.business_website as string | undefined) || (item.place_link as string | undefined) || '';
                              const url = safeHttpUrl(rawUrl);
                              
                              return (
                                 <div
                                 className={`leading-6 mb-4 mr-3 p-3 text-sm break-all pr-3 rounded border
                                 ${item.isOwn ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}
                                 data-own={item.isOwn ? 'true' : 'false'}
                                 key={rawUrl + position}>
                                    <h4 className='font-semibold text-blue-700'>
                                       {url ? (
                                          <a href={url} target="_blank" rel='noreferrer'>{`${position}. ${title}`}</a>
                                       ) : (
                                          `${position}. ${title}`
                                       )}
                                    </h4>
                                    {url ? <a className=' text-green-900' href={url} target="_blank" rel='noreferrer'>{url}</a> : (rawUrl && <span className=' text-green-900'>{String(rawUrl)}</span>)}
                                 </div>
                              );
                           })
                        ) : (
                           <div className='text-gray-400 text-sm'>N/A</div>
                        )}
                     </div>
                  </div>
                  <div className='keywordDetails__section mt-10'>
                     <div className="keywordDetails__section__head flex justify-between items-center pb-4 mb-4 border-b border-b-slate-200">
                        <h3 className=' font-bold text-gray-700 lg:text-lg'>Google Search Result
                           <a className='text-gray-400 hover:text-indigo-600 inline-block ml-1 px-2 py-1'
                              href={`https://www.google.com/search?q=${encodeURIComponent(keyword.keyword)}`}
                              target="_blank"
                              rel='noreferrer'>
                              <Icon type='link' size={14} />
                           </a>
                        </h3>
                        <span className=' text-xs text-gray-500'>{updatedDate}</span>
                     </div>
                     <div className='keywordDetails__section__results styled-scrollbar overflow-y-auto max-md:overflow-y-visible' ref={searchResultContainer}>
                        {scrapedCount > 0 && keywordSearchResult.map((item) => {
                           const { position } = keyword;
                           const segUrl = safeHttpUrl(item.url);
                           const domainExist = position > 0 && item.position === position;
                           return (
                              <div
                              ref={domainExist ? searchResultFound : null}
                              className={`leading-6 mb-4 mr-3 p-3 text-sm break-all pr-3 rounded
                              ${domainExist ? ' bg-green-50 border border-green-200' : ''}`}
                              key={item.url + item.position}>
                                 <h4 className='font-semibold text-blue-700'>
                                    {segUrl
                                       ? <a href={segUrl} target="_blank" rel='noreferrer'>{`${item.position}. ${item.title}`}</a>
                                       : `${item.position}. ${item.title}`}
                                 </h4>
                                 {segUrl
                                    ? <a className=' text-green-900' href={segUrl} target="_blank" rel='noreferrer'>{item.url}</a>
                                    : <span className=' text-green-900'>{item.url}</span>}
                              </div>
                           );
                        })}
                     </div>
                  </div>
               </div>
            </div>
       </div>
   );
};

export default KeywordDetails;
