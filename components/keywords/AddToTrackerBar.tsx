import { ReactNode } from 'react';
import { TrackerDevice } from '../../utils/keywordMeta';

type AddToTrackerBarProps = {
   label?: string,
   devices: TrackerDevice[],
   setDevices: (devices: TrackerDevice[]) => void,
   onAdd: () => void,
   addDisabled?: boolean,
   onEmail?: () => void,
   emailDisabled?: boolean,
   // Marks Email as disabled for assistive tech and styling while the handler still runs (it shows the reason)
   emailAriaDisabled?: boolean,
   children?: ReactNode,
}

const deviceOptions: { value: TrackerDevice, label: string }[] = [
   { value: 'desktop', label: 'Desktop' },
   { value: 'mobile', label: 'Mobile' },
];

// Shared add-to-tracker bar. Every control uses the same size so the row reads as one design.
const AddToTrackerBar = ({
   label,
   devices,
   setDevices,
   onAdd,
   addDisabled = false,
   onEmail,
   emailDisabled = false,
   emailAriaDisabled = false,
   children,
}: AddToTrackerBarProps) => {
   const toggleDevice = (device: TrackerDevice) => {
      setDevices(devices.includes(device) ? devices.filter((item) => item !== device) : [...devices, device]);
   };

   return (
      <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center'>
         {label && <span className='text-gray-600 font-semibold sm:mr-2'>{label}</span>}
         {children}
         <div className='flex gap-2 sm:flex-none'>
            {deviceOptions.map(({ value, label: deviceLabel }) => {
               const isActive = devices.includes(value);
               return (
                  <button
                     key={value}
                     type='button'
                     role='checkbox'
                     aria-checked={isActive}
                     className={`flex-1 h-9 px-3 flex items-center justify-center gap-2 rounded font-semibold transition-colors sm:flex-none ${isActive ? 'bg-indigo-100 text-blue-700' : 'bg-indigo-50 text-gray-500'}`}
                     onClick={() => toggleDevice(value)}>
                     <span className={`w-4 h-4 flex items-center justify-center rounded-sm border text-[10px] leading-none ${isActive ? 'bg-blue-700 border-blue-700 text-white' : 'bg-white border-gray-300 text-transparent'}`}>✓</span>
                     {deviceLabel}
                  </button>
               );
            })}
         </div>
         <div className='flex gap-2 sm:flex-none'>
            <button
               type='button'
               className={`flex-1 h-9 text-white bg-blue-700 px-3 rounded font-semibold transition-colors sm:flex-none ${addDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-600'}`}
               tabIndex={addDisabled ? -1 : 0}
               aria-disabled={addDisabled}
               onClick={onAdd}>
               + Add Keywords
            </button>
            {onEmail && (
               <button
                  type='button'
                  className={`flex-1 h-9 text-white bg-indigo-600 px-3 rounded font-semibold transition-colors sm:flex-none ${(emailDisabled || emailAriaDisabled) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-500'}`}
                  disabled={emailDisabled}
                  aria-disabled={emailDisabled || emailAriaDisabled}
                  onClick={onEmail}>
                  Email Keywords
               </button>
            )}
         </div>
      </div>
   );
};

export default AddToTrackerBar;
