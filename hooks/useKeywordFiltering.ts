import { useCallback, useState } from 'react';
import { DEVICE_DESKTOP } from '../utils/constants';

const defaultFilters: KeywordFilters = { countries: [], tags: [], search: '' };

type KeywordFilteringState = {
   device: string,
   filterParams: KeywordFilters,
   sortBy: string,
   scDataType: string,
   showScDataTypes: boolean,
   setDevice: (device: string) => void,
   setFilterParams: (params: KeywordFilters) => void,
   setSortBy: (sortBy: string) => void,
   setScDataType: (scDataType: string) => void,
   toggleScDataTypes: () => void,
   closeScDataTypes: () => void,
};

const useKeywordFiltering = (): KeywordFilteringState => {
   const [device, setDevice] = useState<string>(DEVICE_DESKTOP);
   const [filterParams, setFilterParams] = useState<KeywordFilters>(defaultFilters);
   const [sortBy, setSortBy] = useState<string>('date_asc');
   const [scDataType, setScDataType] = useState<string>('threeDays');
   const [showScDataTypes, setShowScDataTypes] = useState<boolean>(false);

   const toggleScDataTypes = useCallback(() => {
      setShowScDataTypes((currentValue) => !currentValue);
   }, []);

   const closeScDataTypes = useCallback(() => {
      setShowScDataTypes(false);
   }, []);

   return {
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
   };
};

export default useKeywordFiltering;
