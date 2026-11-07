import { useId } from 'react';

type InputFieldProps = {
   label: string;
   value: string;
   onChange: (value: string) => void;
   placeholder?: string;
   hasError?: boolean;
}

const InputField = ({ label = '', value = '', placeholder = '', onChange, hasError = false }: InputFieldProps) => {
   const inputId = useId();
   const labelStyle = 'mb-2 font-semibold inline-block text-sm text-gray-700 capitalize';
   return (
      <div className="field--input w-full relative flex justify-between items-center">
         <label className={labelStyle} htmlFor={inputId}>{label}</label>
         <input
            id={inputId}
            className={`p-2 border border-gray-200 rounded focus:outline-none w-[210px]
             focus:border-blue-200 ${hasError ? ' border-red-400 focus:border-red-400' : ''} `}
            type={'text'}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            autoComplete="off"
            placeholder={placeholder}
         />
      </div>
   );
};

export default InputField;
