import React, { useMemo, useCallback, useRef, useEffect, useReducer } from 'react';
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';
import { filterKeywords, keywordsByDevice, sortKeywords } from '../../utils/client/sortFilter';
import Icon from '../common/Icon';
import SpinnerMessage from '../common/SpinnerMessage';
import Keyword from './Keyword';
import KeywordDetails from './KeywordDetails';
import KeywordFilters from './KeywordFilter';
import Modal from '../common/Modal';
import { useDeleteKeywords, useFavKeywords, useRefreshKeywords } from '../../services/keywords';
import KeywordTagManager from './KeywordTagManager';
import AddTags from './AddTags';
import useWindowResize from '../../hooks/useWindowResize';
import useIsMobile from '../../hooks/useIsMobile';
import useKeywordFiltering from '../../hooks/useKeywordFiltering';
import { useUpdateSettings } from '../../services/settings';
import { defaultSettings } from '../settings/Settings';

type KeywordsTableProps = {
   domain: DomainType | null,
   keywords: KeywordType[],
   isLoading: boolean,
   showAddModal: boolean,
   setShowAddModal: Function,
   isConsoleIntegrated: boolean,
   settings?: SettingsType
}

type KeywordsTableState = {
   selectedKeywords: number[],
   showKeyDetails: KeywordType | null,
   showRemoveModal: boolean,
   showTagManager: number | null,
   showAddTags: boolean,
   SCListHeight: number,
   maxTitleColumnWidth: number,
};

type KeywordsTableAction =
   | { type: 'toggleSelection'; keywordId: number }
   | { type: 'setSelectedKeywords'; selectedKeywords: number[] }
   | { type: 'showKeyDetails'; keyword: KeywordType | null }
   | { type: 'showRemoveModal'; show: boolean }
   | { type: 'showTagManager'; keywordId: number | null }
   | { type: 'showAddTags'; show: boolean }
   | { type: 'setListHeight'; height: number }
   | { type: 'setMaxTitleColumnWidth'; width: number }
   | { type: 'prepareRemove'; keywordId: number }
   | { type: 'closeRemoveModal' }
   | { type: 'clearSelection' }
   | { type: 'clearSelectionAndCloseRemoveModal' };

const keywordsTableReducer = (state: KeywordsTableState, action: KeywordsTableAction): KeywordsTableState => {
   switch (action.type) {
      case 'toggleSelection': {
         const updatedSelected = state.selectedKeywords.includes(action.keywordId)
            ? state.selectedKeywords.filter((keyId) => keyId !== action.keywordId)
            : [...state.selectedKeywords, action.keywordId];
         return { ...state, selectedKeywords: updatedSelected };
      }
      case 'setSelectedKeywords':
         return { ...state, selectedKeywords: action.selectedKeywords };
      case 'showKeyDetails':
         return { ...state, showKeyDetails: action.keyword };
      case 'showRemoveModal':
         return { ...state, showRemoveModal: action.show };
      case 'showTagManager':
         return { ...state, showTagManager: action.keywordId };
      case 'showAddTags':
         return { ...state, showAddTags: action.show };
      case 'setListHeight':
         return { ...state, SCListHeight: action.height };
      case 'setMaxTitleColumnWidth':
         return { ...state, maxTitleColumnWidth: action.width };
      case 'prepareRemove':
         return { ...state, selectedKeywords: [action.keywordId], showRemoveModal: true };
      case 'closeRemoveModal':
         return { ...state, showRemoveModal: false };
      case 'clearSelection':
         return { ...state, selectedKeywords: [] };
      case 'clearSelectionAndCloseRemoveModal':
         return { ...state, selectedKeywords: [], showRemoveModal: false };
      default: {
         const exhaustiveCheck: never = action;
         void exhaustiveCheck;
         return state;
      }
    }
};

const KeywordsTable = (props: KeywordsTableProps) => {
   const titleColumnRef = useRef(null);
   const { keywords = [], isLoading = true, isConsoleIntegrated = false, settings } = props;
   const showSCData = isConsoleIntegrated;
   const {
      device,
      filterParams,
      sortBy,
      scDataType,
      showScDataTypes,
      setDevice,
      setFilterParams,
      setSortBy,
      setScDataType,
      toggleScDataTypes,
      closeScDataTypes,
   } = useKeywordFiltering();
   const [state, dispatch] = useReducer(keywordsTableReducer, {
      selectedKeywords: [],
      showKeyDetails: null,
      showRemoveModal: false,
      showTagManager: null,
      showAddTags: false,
      SCListHeight: 500,
      maxTitleColumnWidth: 320,
   });
   const { mutate: deleteMutate } = useDeleteKeywords(() => {});
   const { mutate: favoriteMutate } = useFavKeywords(() => {});
   const { mutate: refreshMutate } = useRefreshKeywords(() => {});
   const [isMobile] = useIsMobile();

   useWindowResize(() => {
      dispatch({ type: 'setListHeight', height: window.innerHeight - (isMobile ? 200 : 400) });
      if (titleColumnRef.current) {
         dispatch({ type: 'setMaxTitleColumnWidth', width: (titleColumnRef.current as HTMLElement).clientWidth });
      }
   });

   useEffect(() => {
      if (titleColumnRef.current) {
         dispatch({ type: 'setMaxTitleColumnWidth', width: (titleColumnRef.current as HTMLElement).clientWidth });
      }
   }, [titleColumnRef]);

   const tableColumns = settings?.keywordsColumns || ['Best', 'History', 'Volume', 'Search Console'];
   const { mutate: updateMutate } = useUpdateSettings(() => {});

   const scDataObject:{ [k:string] : string} = {
      threeDays: 'Last Three Days',
      sevenDays: 'Last Seven Days',
      thirtyDays: 'Last Thirty Days',
      avgThreeDays: 'Last Three Days Avg',
      avgSevenDays: 'Last Seven Days Avg',
      avgThirtyDays: 'Last Thirty Days Avg',
   };

   const processedKeywords: {[key:string] : KeywordType[]} = useMemo(() => {
      const procKeywords = keywords.filter((x) => x.device === device);
      const filteredKeywords = filterKeywords(procKeywords, filterParams);
      const sortedKeywords = sortKeywords(filteredKeywords, sortBy, scDataType);
      return keywordsByDevice(sortedKeywords, device);
   }, [keywords, device, sortBy, filterParams, scDataType]);

   const allDomainTags: string[] = useMemo(() => {
      const allTags = keywords.reduce((acc: string[], keyword) => [...acc, ...keyword.tags], []).filter((t) => t && t.trim() !== '');
      return [...new Set(allTags)];
   }, [keywords]);

   const selectKeyword = (keywordId: number) => dispatch({ type: 'toggleSelection', keywordId });

   const updateColumns = (column:string) => {
      const newColumns = tableColumns.includes(column) ? tableColumns.filter((col) => col !== column) : [...tableColumns, column];
      updateMutate({ ...defaultSettings, ...settings, keywordsColumns: newColumns });
   };

   const shouldHideColumn = useCallback((col:string) => settings?.keywordsColumns && !settings?.keywordsColumns.includes(col) ? 'lg:hidden' : '', [settings?.keywordsColumns]);

   const Row = ({ data, index, style }:ListChildComponentProps) => {
      const keyword = data[index];
      return (
         <Keyword
          key={keyword.ID}
          style={style}
          index={index}
          selected={state.selectedKeywords.includes(keyword.ID)}
          selectKeyword={selectKeyword}
          keywordData={keyword}
          refreshkeyword={() => refreshMutate({ ids: [keyword.ID] })}
          favoriteKeyword={favoriteMutate}
          manageTags={() => dispatch({ type: 'showTagManager', keywordId: keyword.ID })}
          removeKeyword={() => dispatch({ type: 'prepareRemove', keywordId: keyword.ID })}
          showKeywordDetails={() => dispatch({ type: 'showKeyDetails', keyword })}
          lastItem={index === (processedKeywords[device].length - 1)}
          showSCData={showSCData}
          scDataType={scDataType}
          tableColumns={tableColumns}
          maxTitleColumnWidth={state.maxTitleColumnWidth}
          />
       );
    };

   const selectedAllItems = state.selectedKeywords.length === processedKeywords[device].length;

   let keywordsContent: JSX.Element | null = null;
   if (processedKeywords[device] && processedKeywords[device].length > 0) {
      if (isMobile) {
         keywordsContent = (
            <div className='block sm:hidden'>
               {processedKeywords[device].map((keyword, index) => (
                  <Keyword
                     key={keyword.ID}
                     style={{}}
                     index={index}
                     selected={state.selectedKeywords.includes(keyword.ID)}
                     selectKeyword={selectKeyword}
                     keywordData={keyword}
                     refreshkeyword={() => refreshMutate({ ids: [keyword.ID] })}
                     favoriteKeyword={favoriteMutate}
                     manageTags={() => dispatch({ type: 'showTagManager', keywordId: keyword.ID })}
                     removeKeyword={() => dispatch({ type: 'prepareRemove', keywordId: keyword.ID })}
                     showKeywordDetails={() => dispatch({ type: 'showKeyDetails', keyword })}
                     lastItem={index === (processedKeywords[device].length - 1)}
                     showSCData={showSCData}
                     scDataType={scDataType}
                     maxTitleColumnWidth={state.maxTitleColumnWidth}
                     tableColumns={tableColumns}
                   />
                ))}
             </div>
          );
       } else {
          keywordsContent = (
             <div className='hidden sm:block'>
                <List
                innerElementType="div"
                itemData={processedKeywords[device]}
                itemCount={processedKeywords[device].length}
                itemSize={57}
                height={state.SCListHeight}
                width={'100%'}
                className={'styled-scrollbar'}
                >
                   {Row}
               </List>
            </div>
         );
      }
   } else {
      keywordsContent = (
         !isLoading ? (
            <p className=' p-9 pt-[10%] text-center text-gray-500'>No Keywords Added for this Device Type.</p>
         ) : (
            <SpinnerMessage className='p-9 pt-[10%] text-center' label='Loading keywords' />
         )
      );
   }
   return (
      <div>
         <div className='domKeywords flex flex-col bg-[white] rounded-md text-sm border mb-5'>
            {state.selectedKeywords.length > 0 && (
               <div className='font-semibold text-sm py-4 px-8 text-gray-500 '>
                  <ul className=''>
                     <li className='inline-block mr-4'>
                        <a
                        className='block px-2 py-2 cursor-pointer hover:text-indigo-600'
                        onClick={() => { refreshMutate({ ids: state.selectedKeywords }); dispatch({ type: 'clearSelection' }); }}
                        >
                           <span className=' bg-indigo-100 text-blue-700 px-1 rounded'><Icon type="reload" size={11} /></span> Refresh Keywords
                        </a>
                     </li>
                     <li className='inline-block mr-4'>
                        <a
                        className='block px-2 py-2 cursor-pointer hover:text-indigo-600'
                        onClick={() => dispatch({ type: 'showRemoveModal', show: true })}
                        >
                           <span className=' bg-red-100 text-red-600 px-1 rounded'><Icon type="trash" size={14} /></span> Remove Keywords</a>
                     </li>
                     <li className='inline-block mr-4'>
                        <a
                        className='block px-2 py-2 cursor-pointer hover:text-indigo-600'
                        onClick={() => dispatch({ type: 'showAddTags', show: true })}
                        >
                           <span className=' bg-green-100 text-green-500  px-1 rounded'><Icon type="tags" size={14} /></span> Tag Keywords</a>
                     </li>
                  </ul>
               </div>
            )}
            {state.selectedKeywords.length === 0 && (
               <KeywordFilters
                  allTags={allDomainTags}
                  filterParams={filterParams}
                  filterKeywords={(params:KeywordFilters) => setFilterParams(params)}
                  updateSort={(sorted:string) => setSortBy(sorted)}
                  sortBy={sortBy}
                  keywords={keywords}
                  device={device}
                  setDevice={setDevice}
                  updateColumns={updateColumns}
                  tableColumns={tableColumns}
                  integratedConsole={isConsoleIntegrated}
               />
            )}
            <div className={`domkeywordsTable domkeywordsTable--keywords 
            ${showSCData && tableColumns.includes('Search Console') ? 'domkeywordsTable--hasSC' : ''} 
               styled-scrollbar w-full overflow-auto min-h-[60vh]`}>
               <div className=' lg:min-w-[800px]'>
                  <div className={`domKeywords_head domKeywords_head--${sortBy} hidden sm:flex p-3 px-6 bg-[#FCFCFF]
                    text-gray-600 justify-between items-center font-semibold border-y`}>
                     <span ref={titleColumnRef} className={`domKeywords_head_keyword flex-1 basis-[6rem] w-auto lg:flex-1 
                        ${showSCData && tableColumns.includes('Search Console') ? 'lg:basis-24' : 'lg:basis-12'} lg:w-auto lg:flex lg:items-center `}>
                     {processedKeywords[device].length > 0 && (
                        <button
                           className={`p-0 mr-2 leading-[0px] inline-block rounded-sm pt-0 px-[1px] pb-[3px]  border border-slate-300 
                            ${selectedAllItems ? ' bg-blue-700 border-blue-700 text-white' : 'text-transparent'}`}
                           onClick={() => dispatch({ type: 'setSelectedKeywords', selectedKeywords: selectedAllItems ? [] : processedKeywords[device].map((k: KeywordType) => k.ID) })}
                            >
                               <Icon type="check" size={10} />
                        </button>
                     )}
                  {/* ${showSCData ? 'lg:min-w-[220px]' : 'lg:min-w-[280px]'} */}
                        <span className={`inline-block lg:flex lg:items-center 
                           ${showSCData && tableColumns.includes('Search Console') ? 'lg:max-w-[320px]' : ''}`}>
                           Keyword
                        </span>
                     </span>
                     <span className='domKeywords_head_position flex-1 basis-24 grow-0 text-center'>Position</span>
                     <span className={`domKeywords_head_best flex-1 basis-16 grow-0 text-center  ${shouldHideColumn('Best')}`}>Best</span>
                     <span className={`domKeywords_head_history flex-1 basis-20 grow-0  ${shouldHideColumn('History')}`}>History (7d)</span>
                     <span className={`domKeywords_head_volume flex-1 basis-24 grow-0 text-center ${shouldHideColumn('Volume')}`}>Volume</span>
                     <span className='domKeywords_head_url flex-1 basis-32'>URL</span>
                     <span className='domKeywords_head_updated flex-1 relative left-3 max-w-[150px]'>Updated</span>
                     {showSCData && tableColumns.includes('Search Console') && (
                        <div className='domKeywords_head_sc flex-1 min-w-[170px] lg:max-w-[170px] mr-7 text-center'>
                           {/* Search Console */}
                           <div>
                              <div
                              className=' w-48 select-none cursor-pointer absolute bg-white rounded-full
                              px-2 py-[2px] mt-[-22px] ml-3 border border-gray-200 z-40'
                              onClick={toggleScDataTypes}>
                                 <Icon type="google" size={13} /> {scDataObject[scDataType]}
                                 <Icon classes="ml-2" type={showScDataTypes ? 'caret-up' : 'caret-down'} size={10} />
                              </div>
                              {showScDataTypes && (
                                 <div className='absolute bg-white border border-gray-200 z-50 w-44 rounded mt-2 ml-5 text-gray-500'>
                                     {Object.keys(scDataObject).map((itemKey) => <span
                                                 className={`block p-2 cursor-pointer hover:bg-indigo-50 hover:text-indigo-600
                                                  ${scDataType === itemKey ? 'bg-indigo-100 text-indigo-600' : ''}`}
                                                 key={itemKey}
                                                 onClick={() => { setScDataType(itemKey); closeScDataTypes(); }}>
                                                    {scDataObject[itemKey]}
                                                 </span>)}
                                 </div>
                              )}
                           </div>
                           <div className='relative top-2 flex justify-between'>
                              <span className='min-w-[40px]'>Pos</span>
                              <span className='min-w-[40px]'>Imp</span>
                              <span className='min-w-[40px]'>Visits</span>
                              {/* <span>CTR</span> */}
                           </div>
                        </div>
                     )}
                  </div>
                  <div className='domKeywords_keywords border-gray-200 min-h-[55vh] relative'>
                       {keywordsContent}
                  </div>
               </div>
            </div>
         </div>
         {state.showKeyDetails && state.showKeyDetails.ID && (
            <KeywordDetails keyword={state.showKeyDetails} closeDetails={() => dispatch({ type: 'showKeyDetails', keyword: null })} />
         )}
         {state.showRemoveModal && state.selectedKeywords.length > 0 && (
            <Modal closeModal={() => dispatch({ type: 'clearSelectionAndCloseRemoveModal' })} title={'Remove Keywords'}>
                  <div className='text-sm'>
                     <p>Are you sure you want to remove {state.selectedKeywords.length > 1 ? 'these' : 'this'} Keyword?</p>
                     <div className='mt-6 text-right font-semibold'>
                        <button
                        className=' py-1 px-5 rounded cursor-pointer bg-indigo-50 text-slate-500 mr-3'
                        onClick={() => dispatch({ type: 'clearSelectionAndCloseRemoveModal' })}>
                           Cancel
                        </button>
                        <button
                        className=' py-1 px-5 rounded cursor-pointer bg-red-400 text-white'
                        onClick={() => { deleteMutate(state.selectedKeywords); dispatch({ type: 'clearSelectionAndCloseRemoveModal' }); }}>
                           Remove
                        </button>
                     </div>
                  </div>
            </Modal>
         )}
         {state.showTagManager && (
            <KeywordTagManager
               allTags={allDomainTags}
               keyword={keywords.find((k) => k.ID === state.showTagManager)}
               closeModal={() => dispatch({ type: 'showTagManager', keywordId: null })}
               />
         )}
         {state.showAddTags && (
            <AddTags
               existingTags={allDomainTags}
               keywords={keywords.filter((k) => state.selectedKeywords.includes(k.ID))}
               closeModal={() => dispatch({ type: 'showAddTags', show: false })}
               />
         )}
      </div>
   );
 };

 export default KeywordsTable;
