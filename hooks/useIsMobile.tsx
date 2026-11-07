import { useEffect, useState } from 'react';

const useIsMobile = () => {
   const [isMobile, setIsMobile] = useState<boolean>(false);
   const [isClient, setIsClient] = useState<boolean>(false);

   useEffect(() => {
      // Mark that we're now on the client side
      setIsClient(true);

      const mediaQuery = window.matchMedia('(min-width: 1024px)');

      // Match Tailwind's desktop boundary.
      const checkIsMobile = () => {
         setIsMobile(!mediaQuery.matches);
      };

      // Initial check
      checkIsMobile();

      // Add listener for resize events
      mediaQuery.addEventListener('change', checkIsMobile);

      // Cleanup
      return () => {
         mediaQuery.removeEventListener('change', checkIsMobile);
      };
   }, []);

   // Return false during SSR to prevent hydration mismatch
   return [isClient ? isMobile : false];
};

export default useIsMobile;
