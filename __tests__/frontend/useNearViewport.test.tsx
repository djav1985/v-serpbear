import { act, render } from '@testing-library/react';
import React from 'react';
import { useNearViewport } from 'hooks/use-near-viewport';

describe('useNearViewport', () => {
   const originalObserver = globalThis.IntersectionObserver;
   let callback: IntersectionObserverCallback;
   let observed: Element | undefined;
   let observerOptions: IntersectionObserverInit | undefined;
   let disconnect: jest.Mock;

   beforeEach(() => {
      observed = undefined;
      observerOptions = undefined;
      disconnect = jest.fn();
      class MockIntersectionObserver {
         constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
            callback = cb;
            observerOptions = options;
         }
         // eslint-disable-next-line class-methods-use-this
         observe(element: Element) { observed = element; }
         // eslint-disable-next-line class-methods-use-this
         unobserve() {}
         disconnect = disconnect;
         // eslint-disable-next-line class-methods-use-this
         takeRecords() { return []; }
      }
      Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, value: MockIntersectionObserver });
   });

   afterEach(() => {
      Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, value: originalObserver });
   });

   it('does not report near until the observer intersects, then disconnects', () => {
      const Probe = () => {
         const [ref, near] = useNearViewport<HTMLDivElement>();
         return React.createElement('div', { ref, 'data-near': String(near) });
      };
      const { container } = render(React.createElement(Probe));
      const observer = {} as IntersectionObserver;

      expect(container.firstElementChild?.getAttribute('data-near')).toBe('false');
      expect(observerOptions?.rootMargin).toBe('300px');
      expect(observed).toBe(container.firstElementChild);

      act(() => callback([{ isIntersecting: true, target: observed! } as IntersectionObserverEntry], observer));

      expect(container.firstElementChild?.getAttribute('data-near')).toBe('true');
      expect(disconnect).toHaveBeenCalled();
   });
});
