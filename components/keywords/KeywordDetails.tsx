import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import Icon from '../common/Icon';
import countries from '../../utils/countries';
import Chart from '../common/Chart';
import SelectField from '../common/SelectField';
import { useFetchSingleKeyword } from '../../services/keywords';
import useOnKey from '../../hooks/useOnKey';
import { generateTheChartData } from '../../utils/client/generateChartData';

type KeywordDetailsProps = {
   keyword: KeywordType,
   closeDetails: () => void
}

type ResultSegment = { type: 'result', item: KeywordLastResult } | { type: 'skipped', from: number, to: number };

const KeywordDetails = ({ keyword, closeDetails }:KeywordDetailsProps) => {
   const updatedDate = new Date(keyword.lastUpdated);
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
   const dateOptions = [
      { label: 'Last 7 Days', value: '7' },
      { label: 'Last 30 Days', value: '30' },
      { label: 'Last 90 Days', value: '90' },
      { label: '1 Year', value: '360' },
      { label: 'All Time', value: 'all' },
   ];

   useOnKey('Escape', closeDetails);

   const chartData = useMemo(() => generateTheChartData(keywordHistory, chartTime), [keywordHistory, chartTime]);

   const { scrapedCount, skippedCount, resultSegments } = useMemo(() => {
      const results = Array.isArray(keywordSearchResult) ? keywordSearchResult : [];
      const scraped = results.filter((r) => !r.skipped).length;
      const skipped = results.filter((r) => r.skipped).length;

      const segs: ResultSegment[] = [];
      let skippedStart: number | null = null;
      let skippedEnd: number = 0;

      for (let i = 0; i < results.length; i += 1) {
         const item = results[i];
         if (item.skipped) {
            if (skippedStart === null) { skippedStart = item.position; }
            skippedEnd = item.position;
         } else {
            if (skippedStart !== null) {
               segs.push({ type: 'skipped', from: skippedStart, to: skippedEnd });
               skippedStart = null;
            }
            segs.push({ type: 'result', item });
         }
      }
      if (skippedStart !== null) {
         segs.push({ type: 'skipped', from: skippedStart, to: skippedEnd });
      }

      return { scrapedCount: scraped, skippedCount: skipped, resultSegments: segs };
   }, [keywordSearchResult]);

   // With variable page sizes the max scraped position may be < 100.
   // When scrapedCount > 0 we always show the actual count (covers both "no gaps" and "has gaps").
   // The 'No Results' fallback only triggers when keywordSearchResult is empty (no data yet).
   const notFoundLabel = scrapedCount > 0 ? `Not in First ${scrapedCount}` : 'No Results';

   useLayoutEffect(() => {
      if (keyword.position > 0 && searchResultFound?.current) {
         searchResultFound.current.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'start',
         });
      }
   }, [resultSegments, keyword.position]);

   const closeOnBGClick = (e:React.SyntheticEvent) => {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      if (e.target === e.currentTarget) { closeDetails(); }
   };

   return (
       <div className="keywordDetails fixed w-full h-dvh top-0 left-0 z-[99999]" onClick={closeOnBGClick} data-testid="keywordDetails">
            <div className="keywordDetails absolute w-full lg:w-5/12 bg-white customShadow top-0 right-0 h-dvh overflow-y-auto" >
               <div className='keywordDetails__header p-6 border-b border-b-slate-200 text-slate-600'>
                  <h3 className=' text-lg font-bold flex items-center'>
                     <span className="fflag-stack mr-2">
                        <span
                           title={countries[keyword.country][0]}
                           className={`fflag fflag-${keyword.country} w-[18px] h-[12px]`}
                        />
                        {mapPackTop3 && (
                           <span className="fflag fflag-map-pack w-[18px] h-[12px]" role="img" aria-label="Map pack top three" />
                        )}
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
                        <span className=' text-xs text-gray-500'>{dayjs(updatedDate).format('MMMM D, YYYY')}</span>
                     </div>
                     <div className='keywordDetails__section__results keywordDetails__section__results--local styled-scrollbar overflow-y-auto'>
                        {keywordLocalResults && Array.isArray(keywordLocalResults) && keywordLocalResults.length > 0 ? (
                           keywordLocalResults.map((item, index) => {
                              const position = item.position || index + 1;
                              const title = item.title || (item.name as string | undefined) || `Local Result ${position}`;
                              const url = item.url || (item.website as string | undefined) || (item.link as string | undefined) || (item.business_website as string | undefined) || (item.place_link as string | undefined) || '';
                              
                              return (
                                 <div
                                 className={`leading-6 mb-4 mr-3 p-3 text-sm break-all pr-3 rounded 
                                 ${mapPackTop3 && index < 3 ? ' bg-green-50 border border-green-200' : ''}`}
                                 key={url + position}>
                                    <h4 className='font-semibold text-blue-700'>
                                       {url ? (
                                          <a href={url} target="_blank" rel='noreferrer'>{`${position}. ${title}`}</a>
                                       ) : (
                                          `${position}. ${title}`
                                       )}
                                    </h4>
                                    {url && <a className=' text-green-900' href={url} target="_blank" rel='noreferrer'>{url}</a>}
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
                              href={`https://www.google.com/search?q=${encodeURI(keyword.keyword)}`}
                              target="_blank"
                              rel='noreferrer'>
                              <Icon type='link' size={14} />
                           </a>
                        </h3>
                        <span className=' text-xs text-gray-500'>{dayjs(updatedDate).format('MMMM D, YYYY')}</span>
                     </div>
                     <div className='keywordDetails__section__results styled-scrollbar overflow-y-auto' ref={searchResultContainer}>
                        {skippedCount > 0 && (
                           <div className='mb-4 p-3 rounded bg-blue-50 border border-blue-100 text-xs text-blue-600'>
                              {scrapedCount} result{scrapedCount !== 1 ? 's' : ''} scraped
                              {' • '}
                              {skippedCount} position{skippedCount !== 1 ? 's' : ''} skipped
                              {' (scrape strategy limits pages checked)'}
                           </div>
                        )}
                        {resultSegments.length > 0 && resultSegments.map((seg) => {
                           if (seg.type === 'skipped') {
                              const pageFrom = Math.ceil(seg.from / 10);
                              const pageTo = Math.ceil(seg.to / 10);
                              const count = seg.to - seg.from + 1;
                              const pagesLabel = pageFrom === pageTo ? `Page ${pageFrom}` : `Pages ${pageFrom}–${pageTo}`;
                              return (
                                 <div key={`skipped-${seg.from}`}
                                 className={'leading-6 mb-4 mr-3 px-3 py-2 text-sm rounded '
                                 + 'bg-gray-50 border border-dashed border-gray-200 text-gray-400 italic'}>
                                    {pagesLabel}: {count} result{count !== 1 ? 's' : ''} skipped
                                 </div>
                              );
                           }
                           const { position } = keyword;
                           const domainExist = position > 0 && seg.item.position === position;
                           return (
                              <div
                              ref={domainExist ? searchResultFound : null}
                              className={`leading-6 mb-4 mr-3 p-3 text-sm break-all pr-3 rounded 
                              ${domainExist ? ' bg-amber-50 border border-amber-200' : ''}`}
                              key={seg.item.url + seg.item.position}>
                                 <h4 className='font-semibold text-blue-700'>
                                    <a href={seg.item.url} target="_blank" rel='noreferrer'>{`${seg.item.position}. ${seg.item.title}`}</a>
                                 </h4>
                                 <a className=' text-green-900' href={seg.item.url} target="_blank" rel='noreferrer'>{seg.item.url}</a>
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
