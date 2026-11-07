import { TOGGLE_TRACK_CLASS_NAME } from './toggleStyles';

type ToggleFieldProps = {
   label: string;
   value: boolean;
   onChange: (bool:boolean) => void ;
}

const ToggleField = ({
   label = '',
   value = false,
   onChange,
}: ToggleFieldProps) => {
   const handleChange = () => {
      onChange(!value);
   };

   return (
      <div className="field--toggle w-full relative">
         <label className="relative inline-flex items-center cursor-pointer w-full justify-between">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-300 w-auto">{label}</span>
            <input
            type="checkbox"
            value={value.toString()}
            checked={!!value}
            className="sr-only peer"
            onChange={handleChange}
            />
            <div className={TOGGLE_TRACK_CLASS_NAME}></div>
         </label>
      </div>
   );
};

export default ToggleField;
