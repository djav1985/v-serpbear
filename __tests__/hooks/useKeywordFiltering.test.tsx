import { renderHook, act } from '@testing-library/react';
import useKeywordFiltering from '../../hooks/useKeywordFiltering';
import { DEVICE_DESKTOP, DEVICE_MOBILE } from '../../utils/constants';

describe('useKeywordFiltering', () => {
   it('returns default filter state', () => {
      const { result } = renderHook(() => useKeywordFiltering());

      expect(result.current.device).toBe(DEVICE_DESKTOP);
      expect(result.current.filterParams).toEqual({ countries: [], tags: [], search: '' });
      expect(result.current.sortBy).toBe('date_asc');
      expect(result.current.scDataType).toBe('threeDays');
      expect(result.current.showScDataTypes).toBe(false);
   });

   it('updates filtering state via handlers', () => {
      const { result } = renderHook(() => useKeywordFiltering());

      act(() => {
         result.current.setDevice(DEVICE_MOBILE);
         result.current.setFilterParams({ countries: ['US'], tags: ['brand'], search: 'term' });
         result.current.setSortBy('pos_desc');
         result.current.setScDataType('sevenDays');
         result.current.toggleScDataTypes();
      });

      expect(result.current.device).toBe(DEVICE_MOBILE);
      expect(result.current.filterParams).toEqual({ countries: ['US'], tags: ['brand'], search: 'term' });
      expect(result.current.sortBy).toBe('pos_desc');
      expect(result.current.scDataType).toBe('sevenDays');
      expect(result.current.showScDataTypes).toBe(true);

      act(() => {
         result.current.closeScDataTypes();
      });

      expect(result.current.showScDataTypes).toBe(false);
   });

   it('keeps toggle callback stable and toggles repeatedly', () => {
      const { result, rerender } = renderHook(() => useKeywordFiltering());
      const initialToggle = result.current.toggleScDataTypes;

      rerender();

      expect(result.current.toggleScDataTypes).toBe(initialToggle);

      act(() => {
         result.current.toggleScDataTypes();
         result.current.toggleScDataTypes();
      });

      expect(result.current.showScDataTypes).toBe(false);
   });
});
