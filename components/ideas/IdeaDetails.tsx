import { useMemo, useRef } from 'react';
import { useQuery } from 'react-query';
import { useRouter } from 'next/router';
import Icon from '../common/Icon';
import countries from '../../utils/countries';
import Chart from '../common/Chart';
import useOnKey from '../../hooks/useOnKey';
import { formattedNum } from '../../utils/client/helpers';
import { formatInZone } from '../../utils/timezone';
import { getAppTimezone } from '../../utils/client/appTimezone';
import { closeOnBGClick } from '../../utils/client/closeOnBGClick';
import { safeHttpUrl } from '../../utils/client/safeUrl';
import { fetchSearchResults, type SearchResultsResponse } from '../../services/keywords';

type IdeaDetailsProps = {
   keyword: IdeaKeyword,
   closeDetails: () => void
}

// Neutral placeholder rows shown behind the blur until real results are fetched (no fake URLs)
const PLACEHOLDER_ROWS = [0, 1, 2, 3];

const IdeaDetails = ({ keyword, closeDetails }:IdeaDetailsProps) => {
   const router = useRouter();
   const updatedDate = keyword.updated ? formatInZone(keyword.updated, { month: 'long', day: 'numeric', year: 'numeric' }, getAppTimezone()) : '';
   const searchResultContainer = useRef<HTMLDivElement>(null);
   const searchResultFound = useRef<HTMLDivElement>(null);
   const searchResultReqPayload = { keyword: keyword.keyword, country: keyword.country, device: 'desktop' };
   const { data: keywordSearchResultData, refetch: fetchKeywordSearchResults, isLoading: fetchingResult } = useQuery<SearchResultsResponse | null>(
   `ideas:${keyword.uid}`,
      () => fetchSearchResults(router, searchResultReqPayload),
      { refetchOnWindowFocus: false, enabled: false },
   );
   const { monthlySearchVolumes } = keyword;

   useOnKey('Escape', closeDetails);

   const chartData = useMemo(() => {
      const chartDataObj: { labels: string[], series: number[] } = { labels: [], series: [] };
      Object.keys(monthlySearchVolumes).forEach((dateKey:string) => {
         const dateKeyArr = dateKey.split('-');
         const labelDate = `${dateKeyArr[0].slice(0, 1).toUpperCase()}${dateKeyArr[0].slice(1, 3).toLowerCase()}, ${dateKeyArr[1].slice(2)}`;
         chartDataObj.labels.push(labelDate);
         chartDataObj.series.push(parseInt(monthlySearchVolumes[dateKey], 10));
      });
      return chartDataObj;
   }, [monthlySearchVolumes]);

   const searchResultsFetched = !!keywordSearchResultData?.searchResult?.results;
   const keywordSearchResult = searchResultsFetched ? keywordSearchResultData?.searchResult?.results : [];

   return (
       <div className="IdeaDetails fixed w-full h-screen top-0 left-0 z-[99999]" onClick={(e) => closeOnBGClick(e, closeDetails)} data-testid="IdeaDetails">
            <div className="IdeaDetails absolute w-full lg:w-5/12 bg-white customShadow top-0 right-0 h-screen" >
               <div className='IdeaDetails__header p-6 border-b border-b-slate-200 text-slate-500'>
                  <h3 className=' text-lg font-bold'>
                     <span title={countries[keyword.country]?.[0] ?? keyword.country}
                     className={`fflag fflag-${keyword.country} w-[18px] h-[12px] mr-2`} /> {keyword.keyword}
                     <span className='py-1 px-2 ml-2 rounded bg-blue-50 text-blue-700 text-xs font-bold'>
                        {formattedNum(keyword.avgMonthlySearches)}/month
                     </span>
                  </h3>
                  <button
                  className='absolute top-2 right-2 p-2 px-3 text-gray-400 hover:text-gray-700 transition-all hover:rotate-90'
                  onClick={() => closeDetails()}>
                     <Icon type='close' size={24} />
                  </button>
               </div>
               <div className='IdeaDetails__content p-6'>

                  <div className='IdeaDetails__section'>
                     <div className="IdeaDetails__section__head flex justify-between mb-5">
                        <h3 className=' font-bold text-gray-700 text-lg'>Search Volume Trend</h3>
                     </div>
                     <div className='IdeaDetails__section__chart h-64'>
                        <Chart labels={chartData.labels} series={chartData.series} noMaxLimit={true} reverse={false} />
                     </div>
                  </div>
                  <div className='IdeaDetails__section mt-10'>
                     <div className="IdeaDetails__section__head flex justify-between items-center pb-4 mb-4 border-b border-b-slate-200">
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
                     <div className={'keywordDetails__section__results styled-scrollbar overflow-y-auto relative'} ref={searchResultContainer}>
                        {!searchResultsFetched && (
                           <div className=' absolute flex w-full h-full justify-center items-center flex-col z-50 font-semibold'>
                              <p>View Google Search Results for &quot;{keyword.keyword}&quot;</p>
                              <button
                              onClick={() => fetchKeywordSearchResults()}
                              className='mt-4 text-sm font-semibold py-2 px-5 rounded cursor-pointer bg-blue-700 text-white '>
                                 <Icon type={fetchingResult ? 'loading' : 'google'} /> {fetchingResult ? 'Performing' : 'Perform'}  Google Search
                              </button>
                           </div>
                        )}
                        {!searchResultsFetched && (
                           <div className='blur-sm' aria-hidden='true'>
                              {PLACEHOLDER_ROWS.map((row) => (
                                 <div key={row} className='mb-4 mr-3 p-3 rounded'>
                                    <div className='h-4 w-3/4 mb-2 rounded bg-slate-200' />
                                    <div className='h-3 w-1/2 rounded bg-slate-100' />
                                 </div>
                              ))}
                           </div>
                        )}
                        <div>
                           {keywordSearchResult && Array.isArray(keywordSearchResult) && keywordSearchResult.length > 0 && (
                              keywordSearchResult.map((item, index) => {
                                 const { position } = keyword;
                                 const itemUrl = safeHttpUrl(item.url);
                                 const domainExist = position < 100 && index === (position - 1);
                                 return (
                                    <div
                                    ref={domainExist ? searchResultFound : null}
                                    className={`leading-6 mb-4 mr-3 p-3 text-sm break-all pr-3 rounded 
                                    ${domainExist ? ' bg-amber-50 border border-amber-200' : ''}`}
                                    key={item.url + item.position}>
                                       <h4 className='font-semibold text-blue-700'>
                                          {itemUrl
                                             ? <a href={itemUrl} target="_blank" rel='noreferrer'>{`${index + 1}. ${item.title}`}</a>
                                             : `${index + 1}. ${item.title}`}
                                       </h4>
                                       {itemUrl
                                          ? <a className=' text-green-900' href={itemUrl} target="_blank" rel='noreferrer'>{item.url}</a>
                                          : <span className=' text-green-900'>{item.url}</span>}
                                    </div>
                                 );
                              })
                           )}
                        </div>
                     </div>

                  </div>
               </div>
            </div>
       </div>
   );
};

export default IdeaDetails;
