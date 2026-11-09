'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/** Reports true once the element enters the viewport or the configured prefetch margin. */
export function useNearViewport<T extends HTMLElement>(rootMargin = '300px'): [RefObject<T | null>, boolean] {
   const ref = useRef<T>(null);
   const [near, setNear] = useState(false);

   useEffect(() => {
      const element = ref.current;
      if (!element || near) { return undefined; }

      if (typeof IntersectionObserver === 'undefined') {
         const frame = requestAnimationFrame(() => setNear(true));
         return () => cancelAnimationFrame(frame);
      }

      const observer = new IntersectionObserver((entries) => {
         if (entries.some((entry) => entry.isIntersecting)) {
            setNear(true);
            observer.disconnect();
         }
      }, { rootMargin });
      observer.observe(element);
      return () => observer.disconnect();
   }, [near, rootMargin]);

   return [ref, near];
}
