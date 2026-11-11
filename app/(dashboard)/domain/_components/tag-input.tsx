'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Tags } from 'lucide-react';
import { Input } from 'components/ui/input';

type TagInputProps = {
   value: string;
   onChange: (value: string) => void;
   existingTags: string[];
   placeholder: string;
   id?: string;
   onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
   /** Rendered over the right end of the field, for example an Apply button. */
   children?: ReactNode;
};

/** A comma-separated tag field with a list of the domain's existing tags that are not typed yet. */
export function TagInput({ value, onChange, existingTags = [], placeholder, id, onKeyDown, children }: TagInputProps) {
   const [showSuggestions, setShowSuggestions] = useState(false);
   const inputRef = useRef<HTMLInputElement>(null);
   const typed = value.split(',').map((tag) => tag.trim());
   const suggestions = existingTags.filter((tag) => !typed.includes(tag));

   const insertTag = (tag: string) => {
      const trimmed = value.trim();
      onChange(value + (trimmed.slice(-1) === ',' ? '' : (trimmed ? ', ' : '')) + tag);
      setShowSuggestions(false);
      inputRef.current?.focus();
   };

   return (
      <div className="relative">
         <button
            type="button"
            className="text-muted-foreground absolute top-1/2 left-2 flex -translate-y-1/2 items-center"
            aria-label={showSuggestions ? 'Hide existing tags' : 'Show existing tags'}
            onClick={() => setShowSuggestions(!showSuggestions)}
         >
            <Tags className="size-4" />
            {showSuggestions ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
         </button>
         <Input
            ref={inputRef}
            id={id}
            className="pr-24 pl-12"
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
         />
         {showSuggestions && (
            <ul className="bg-popover absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border text-sm shadow-md">
               {suggestions.map((tag) => (
                  <li key={tag}>
                     <button type="button" className="hover:bg-accent flex w-full items-center gap-2 px-3 py-2 text-left" onClick={() => insertTag(tag)}>
                        <Tags className="text-muted-foreground size-3.5" />{tag}
                     </button>
                  </li>
               ))}
               {suggestions.length === 0 && <li className="text-muted-foreground px-3 py-2">No existing tags found.</li>}
            </ul>
         )}
         {children}
      </div>
   );
}
