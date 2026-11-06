import { useEffect, useRef, useState } from 'react';
import { useUpdateKeywordTags } from '../../services/keywords';
import Modal from '../common/Modal';
import TagInput from './TagInput';

type AddTagsProps = {
   keywords: KeywordType[],
   existingTags: string[],
   mode?: 'add' | 'remove',
   closeModal: (show?: boolean) => void
}

const AddTags = ({ keywords = [], existingTags = [], mode = 'add', closeModal }: AddTagsProps) => {
   const [tagInput, setTagInput] = useState('');
   const [inputError, setInputError] = useState('');
   const { mutate: updateMutate } = useUpdateKeywordTags(() => { setTagInput(''); });
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
            <TagInput
               value={tagInput}
               onChange={setTagInput}
               existingTags={existingTags}
               placeholder={`${mode === 'remove' ? 'Remove Tags' : 'Insert Tags'}. eg: tag1, tag2`}
               inputClassName='w-full border rounded border-gray-200 py-3 px-4 pl-12 outline-none focus:border-indigo-300'
               onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyTags();
                  }
               }}
            >
               <button
               className=" absolute right-2 top-2 cursor-pointer rounded p-2 px-4 bg-indigo-600 text-white font-semibold text-sm"
               onClick={applyTags}>
                  Apply
               </button>
            </TagInput>
         </div>
      </Modal>

   );
};

export default AddTags;
