import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';

type WindowVirtualListProps<T> = {
   items: T[],
   estimateSize: number,
   getItemKey: (item: T) => string | number,
   renderItem: (item: T, index: number) => ReactNode,
   className?: string,
}

/** Virtualizes rows against the document window so mobile lists keep page scrolling. */
const WindowVirtualList = <T,>({ items, estimateSize, getItemKey, renderItem, className }: WindowVirtualListProps<T>) => {
   const listRef = useRef<HTMLDivElement>(null);
   const [scrollMargin, setScrollMargin] = useState(0);

   const updateScrollMargin = useCallback(() => {
      if (listRef.current) {
         const nextMargin = listRef.current.getBoundingClientRect().top + window.scrollY;
         setScrollMargin((current) => current === nextMargin ? current : nextMargin);
      }
   }, []);

   useLayoutEffect(() => {
      updateScrollMargin();
   });

   useEffect(() => {
      window.addEventListener('resize', updateScrollMargin);
      return () => window.removeEventListener('resize', updateScrollMargin);
   }, [updateScrollMargin]);

   const virtualizer = useWindowVirtualizer({
      count: items.length,
      estimateSize: () => estimateSize,
      getItemKey: (index) => getItemKey(items[index]),
      overscan: 5,
      scrollMargin,
   });

   return (
      <div ref={listRef} className={className} style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
         {virtualizer.getVirtualItems().map((virtualRow) => (
            <div
               key={virtualRow.key}
               data-index={virtualRow.index}
               ref={virtualizer.measureElement}
               style={{ position: 'absolute', top: virtualRow.start - scrollMargin, left: 0, width: '100%' }}
            >
               {renderItem(items[virtualRow.index], virtualRow.index)}
            </div>
         ))}
      </div>
   );
};

export default WindowVirtualList;
