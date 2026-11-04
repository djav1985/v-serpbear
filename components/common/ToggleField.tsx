import React from 'react';
import { TOGGLE_TRACK_CLASS_NAME } from './toggleStyles';

type ToggleFieldProps = {
   label: string;
   value: boolean;
   onChange: (bool:boolean) => void ;
   classNames?: string;
   disabled?: boolean;
}

const ToggleField = ({
   label = '',
   value = false,
   onChange,
   classNames = '',
   disabled = false,
}: ToggleFieldProps) => {
   const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) {
         event.preventDefault();
         event.stopPropagation();
         return;
      }
      onChange(!value);
   };

   return (
      <div className={`field--toggle w-full relative ${classNames}`}>
         <label className="relative inline-flex items-center cursor-pointer w-full justify-between">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-300 w-auto">{label}</span>
            <input
            type="checkbox"
            value={value.toString()}
            checked={!!value}
            className="sr-only peer"
            onChange={handleChange}
            disabled={disabled}
            />
            <div className={TOGGLE_TRACK_CLASS_NAME}></div>
         </label>
      </div>
   );
};

export default ToggleField;
