import type { SyntheticEvent } from 'react';

/**
 * Backdrop click handler for modal-like overlays (modals, slide-overs, drawers).
 * Closes only when the click lands on the overlay itself, not on its content,
 * and stops the event from reaching any element behind the overlay.
 */
export const closeOnBGClick = (e: SyntheticEvent, close: () => void) => {
   e.stopPropagation();
   e.nativeEvent.stopImmediatePropagation();
   if (e.target === e.currentTarget) { close(); }
};

export default closeOnBGClick;
