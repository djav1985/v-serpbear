import React, { ReactNode, useRef, useState } from 'react';
import Icon from '../common/Icon';

type TagInputProps = {
   value: string,
   onChange: (value: string) => void,
   existingTags: string[],
   placeholder: string,
   inputClassName?: string,
   onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void,
   children?: ReactNode,
}

const defaultInputClassName = 'w-full border rounded border-gray-200 py-2 px-4 pl-12 outline-none focus:border-indigo-300';

const TagInput = ({
   value,
   onChange,
   existingTags = [],
   placeholder,
   inputClassName = defaultInputClassName,
   onKeyDown,
   children,
}: TagInputProps) => {
   const [showSuggestions, setShowSuggestions] = useState(false);
   const inputRef = useRef<HTMLInputElement>(null);

   const insertTag = (tag: string) => {
      const tagToInsert = value + (value.trim().slice(-1) === ',' ? '' : (value.trim() ? ', ' : '')) + tag;
      onChange(tagToInsert);
      setShowSuggestions(false);
      if (inputRef?.current) inputRef.current.focus();
   };

   return (
      <div className='relative'>
         <button type="button" aria-label={showSuggestions ? 'Hide existing tags' : 'Show existing tags'} aria-expanded={showSuggestions}
         className='absolute text-gray-400 top-3 left-2 cursor-pointer' onClick={() => setShowSuggestions(!showSuggestions)}>
            <Icon type="tags" size={16} color={showSuggestions ? '#777' : '#aaa'} />
            <Icon type={showSuggestions ? 'caret-up' : 'caret-down'} size={14} color={showSuggestions ? '#666' : '#aaa'} />
         </button>
         <input
            ref={inputRef}
            className={inputClassName}
            placeholder={placeholder}
            aria-label={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
         />
         {showSuggestions && (
            <ul className={`absolute z-50
            bg-white border border-t-0 border-gray-200 rounded rounded-t-none w-full`}>
               {existingTags.length > 0 && existingTags.map((tag, index) => (
                  value.split(',').map((t) => t.trim()).includes(tag) === false && (
                     <li key={index}>
                        <button type="button" className='p-2 w-full text-left hover:text-indigo-600 hover:bg-indigo-50 transition'
                        onClick={() => insertTag(tag)}>
                        <Icon type='tags' size={14} color='#bbb' /> {tag}
                        </button>
                     </li>
                  )
               ))}
               {existingTags.length === 0 && <p>No Existing Tags Found... </p>}
            </ul>
         )}
         {children}
      </div>
   );
};

export default TagInput;
