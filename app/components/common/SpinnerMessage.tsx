import React from 'react';
import Icon from './Icon';

type SpinnerMessageProps = {
   label?: string;
   className?: string;
};

const SpinnerMessage = ({ label = 'Loading data', className = '' }: SpinnerMessageProps) => (
      <div
         className={`flex flex-col items-center justify-center text-gray-500 ${className}`.trim()}
         role='status'
         aria-live='polite'
         aria-label={label}
      >
         <Icon type='loading' size={24} />
      </div>
   );

export default SpinnerMessage;
