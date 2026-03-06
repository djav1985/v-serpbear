import { useEffect, useRef, useState } from 'react';
import { useUpdateKeywordTags } from '../../services/keywords';
import Icon from '../common/Icon';
import Modal from '../common/Modal';

type AddTagsProps = {
   keywords: KeywordType[],
   existingTags: string[],
   mode?: 'add' | 'remove',
   closeModal: (show?: boolean) => void
}

const AddTags = ({ keywords = [], existingTags = [], mode = 'add', closeModal }: AddTagsProps) => {
   const [tagInput, setTagInput] = useState('');
   const [inputError, setInputError] = useState('');
   const [showSuggestions, setShowSuggestions] = useState(false);
   const { mutate: updateMutate } = useUpdateKeywordTags(() => { setTagInput(''); });
   const inputRef = useRef(null);
   const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

   // Cleanup timeout on unmount
   useEffect(() => () => {
         if (errorTimeoutRef.current) {
            clearTimeout(errorTimeoutRef.current);
         }
      }, []);

   const applyTags = () => {
      if (keywords.length === 0) { return; }
      if (!tagInput.trim()) {
         if (errorTimeoutRef.current) {
            clearTimeout(errorTimeoutRef.current);
         }
         setInputError(`Please Insert ${mode === 'remove' ? 'a Tag to Remove' : 'a Tag'}!`);
         errorTimeoutRef.current = setTimeout(() => {
            setInputError('');
            errorTimeoutRef.current = null;
         }, 3000);
         return;
      }

      const tagsArray = Array.from(new Set(
         tagInput
            .split(',')
            .map((t) => t.trim())
            .filter((tag) => tag.length > 0),
      ));
      const tagsPayload: Record<number, string[]> = {};
      const tagsArrayNormalized = tagsArray.map((tag) => tag.toLowerCase());
      keywords.forEach((keyword:KeywordType) => {
         tagsPayload[keyword.ID] = mode === 'remove'
            ? keyword.tags.filter((tag) => !tagsArrayNormalized.includes(tag.toLowerCase()))
            : Array.from(new Set([...keyword.tags, ...tagsArray]));
      });
      updateMutate({ tags: tagsPayload });
   };

   return (
      <Modal
         closeModal={() => { closeModal(false); }}
         title={`${mode === 'remove' ? 'Remove Tags from' : 'Add New Tags to'} ${keywords.length} Selected Keyword${keywords.length > 1 ? 's' : ''}`}
      >
         <div className="relative">
            {inputError && <span className="absolute top-[-24px] text-red-400 text-sm font-semibold">{inputError}</span>}
            <span className='absolute text-gray-400 top-3 left-2 cursor-pointer' onClick={() => setShowSuggestions(!showSuggestions)}>
               <Icon type="tags" size={16} color={showSuggestions ? '#777' : '#aaa'} />
               <Icon type={showSuggestions ? 'caret-up' : 'caret-down'} size={14} color={showSuggestions ? '#666' : '#aaa'} />
            </span>
            <input
               ref={inputRef}
               className='w-full border rounded border-gray-200 py-3 px-4 pl-12 outline-none focus:border-indigo-300'
               placeholder={`${mode === 'remove' ? 'Remove Tags' : 'Insert Tags'}. eg: tag1, tag2`}
               value={tagInput}
               onChange={(e) => setTagInput(e.target.value)}
               onKeyDown={(e) => {
                  if (e.code === 'Enter') {
                    e.preventDefault();
                    applyTags();
                  }
               }}
            />
            {showSuggestions && (
               <ul className={`absolute z-50
               bg-white border border-t-0 border-gray-200 rounded rounded-t-none w-full`}>
                  {existingTags.length > 0 && existingTags.map((tag, index) => (
                     tagInput.split(',').map((t) => t.trim()).includes(tag) === false && (
                              <li
                              className=' p-2 cursor-pointer hover:text-indigo-600 hover:bg-indigo-50 transition'
                              key={index}
                              onClick={() => {
                                  
                                 const tagToInsert = tagInput + (tagInput.trim().slice(-1) === ',' ? '' : (tagInput.trim() ? ', ' : '')) + tag;
                                 setTagInput(tagToInsert);
                                 setShowSuggestions(false);
                                 if (inputRef?.current) (inputRef.current as HTMLInputElement).focus();
                              }}>
                                 <Icon type='tags' size={14} color='#bbb' /> {tag}
                              </li>
                     )
                  ))}
                  {existingTags.length === 0 && <p>No Existing Tags Found... </p>}
               </ul>
            )}

            <button
            className=" absolute right-2 top-2 cursor-pointer rounded p-2 px-4 bg-indigo-600 text-white font-semibold text-sm"
            onClick={applyTags}>
               Apply
            </button>
         </div>
      </Modal>

   );
};

export default AddTags;
