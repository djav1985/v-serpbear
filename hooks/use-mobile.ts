import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
};

export function useIsMobile() {
  // Reads the media query directly, so there is no extra render after mount. The server always renders the wide layout.
  return React.useSyncExternalStore(subscribe, () => window.innerWidth < MOBILE_BREAKPOINT, () => false);
}
