import { useCallback, useRef } from 'react';

/** Match header and summary padding to the space taken by the virtual list scrollbar. */
const useTableScrollbar = () => {
   const observer = useRef<ResizeObserver | null>(null);
   const table = useRef<HTMLDivElement>(null);

   const listInnerRef = useCallback((inner: HTMLDivElement | null) => {
      observer.current?.disconnect();
      const updateGutter = () => {
         const list = inner?.parentElement;
         table.current?.style.setProperty('--table-scrollbar', `${list ? list.offsetWidth - list.clientWidth : 0}px`);
      };

      updateGutter();
      if (inner && typeof ResizeObserver !== 'undefined') {
         observer.current = new ResizeObserver(updateGutter);
         observer.current.observe(inner);
      }
   }, []);

   return { table, listInnerRef };
};

export default useTableScrollbar;
