import { RefObject, useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
   'a[href]',
   'button:not([disabled])',
   'input:not([disabled])',
   'select:not([disabled])',
   'textarea:not([disabled])',
   '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Adds initial focus, Escape handling, tab containment, and focus restoration to a modal dialog. */
const useDialogA11y = (dialogRef: RefObject<HTMLElement>, onClose: () => void) => {
   const onCloseRef = useRef(onClose);

   useEffect(() => {
      onCloseRef.current = onClose;
   }, [onClose]);

   useEffect(() => {
      const dialog = dialogRef.current;
      if (!dialog) { return undefined; }

      const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const getFocusableElements = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const focusableElements = getFocusableElements();
      (focusableElements[0] || dialog).focus();

      const handleKeyDown = (event: KeyboardEvent) => {
         if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onCloseRef.current();
            return;
         }

         if (event.key !== 'Tab') { return; }
         const currentElements = getFocusableElements();
         if (currentElements.length === 0) {
            event.preventDefault();
            dialog.focus();
            return;
         }

         const first = currentElements[0];
         const last = currentElements[currentElements.length - 1];
         if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
            event.preventDefault();
            last.focus();
         } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
            event.preventDefault();
            first.focus();
         }
      };

      dialog.addEventListener('keydown', handleKeyDown);
      return () => {
         dialog.removeEventListener('keydown', handleKeyDown);
         previouslyFocused?.focus();
      };
   }, [dialogRef]);
};

export default useDialogA11y;
