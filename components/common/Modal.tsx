import React, { useId, useRef } from 'react';
import Icon from './Icon';
import useDialogA11y from '../../hooks/useDialogA11y';
import { closeOnBGClick } from '../../utils/client/closeOnBGClick';

// Tailwind only generates classes it can find as complete strings, so each accepted width maps to a literal class.
// '1/2' (the default) maps to w-full: the max-w caps below size the modal, and w-1/2 would halve it on phones.
const MODAL_WIDTH_CLASSES = {
   '1/2': 'w-full',
   '[340px]': 'w-[340px]',
   '[420px]': 'w-[420px]',
   '[500px]': 'w-[500px]',
} as const;

type ModalWidth = keyof typeof MODAL_WIDTH_CLASSES;

type ModalProps = {
   children: React.ReactNode,
   width?: ModalWidth,
   title?: string,
   verticalCenter?: boolean,
   closeModal: () => void,
}

const Modal = React.forwardRef<HTMLDivElement, ModalProps>(({
   children,
   width = '1/2',
   closeModal,
   title,
   verticalCenter = false,
}:ModalProps, ref) => {
   const dialogRef = useRef<HTMLDivElement>(null);
   const titleId = useId();
   useDialogA11y(dialogRef, closeModal);

   return (
      <div ref={ref} className='modal fixed top-0 left-0 bg-white/[.7] w-full h-dvh z-50 overflow-y-auto' onClick={(e) => closeOnBGClick(e, closeModal)}>
         <div
         ref={dialogRef}
         role="dialog"
         aria-modal="true"
         aria-labelledby={title ? titleId : undefined}
         aria-label={title ? undefined : 'Dialog'}
         tabIndex={-1}
         className={`modal__content max-w-[340px] absolute left-0 right-0 ml-auto mr-auto ${MODAL_WIDTH_CLASSES[width]}
         lg:max-w-md bg-white shadow-md rounded-md p-5 border-t-[1px] border-gray-100 text-base
         ${verticalCenter ? ' top-1/2 translate-y-[-50%]' : 'top-1/4'}`}>
            {title && <h3 id={titleId} className=' font-semibold mb-3'>{title}</h3>}
            <button
            type='button'
            aria-label='Close'
            className='modal-close absolute right-2 top-2 p-2 cursor-pointer text-gray-400 transition-all
             hover:text-gray-700 hover:rotate-90' onClick={() => closeModal()}>
               <Icon type="close" size={18} />
            </button>
            <div>{children}</div>
         </div>
      </div>
   );
});

Modal.displayName = 'Modal';

export default Modal;
