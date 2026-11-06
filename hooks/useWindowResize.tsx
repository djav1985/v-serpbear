import { useEffect, useRef } from 'react';

/**
 * Runs `onResize` on mount, on every render that passes a new callback, and on window resize.
 * The latest callback is kept in a ref so the window listener is attached once, not on every render.
 */
const useWindowResize = (onResize: () => void) => {
   const onResizeRef = useRef(onResize);

   useEffect(() => {
      onResizeRef.current = onResize;
      onResize();
   });

   useEffect(() => {
      // Only run on client side
      if (typeof window === 'undefined') { return undefined; }
      const handleResize = () => onResizeRef.current();
      window.addEventListener('resize', handleResize);
      return () => {
         window.removeEventListener('resize', handleResize);
      };
   }, []);
};

export default useWindowResize;
