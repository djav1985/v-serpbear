import { useState } from 'react';
import { useUpdateKeywordTags } from '../../services/keywords';
import Icon from '../common/Icon';
import Modal from '../common/Modal';
import AddTags from './AddTags';

type keywordTagManagerProps = {
   // One keyword (the row menu) or the selected keywords (the bulk menu)
   keywords: KeywordType[],
   closeModal: (show?: boolean) => void,
   allTags: string[]
}

const KeywordTagManager = ({ keywords = [], allTags = [], closeModal }: keywordTagManagerProps) => {
   const [showAddTag, setShowAddTag] = useState<boolean>(false);
   const { mutate: updateMutate } = useUpdateKeywordTags(() => { });
   const isSingle = keywords.length === 1;
   // Every tag on any of the keywords, once; removing one takes it off each keyword that has it
   const tags: string[] = Array.from(new Set(keywords.flatMap((keyword) => keyword.tags)));

   const removeTag = (tag: string) => {
      const tagsPayload: Record<number, string[]> = {};
      keywords.forEach((keyword) => {
         if (keyword.tags.includes(tag.trim())) {
            tagsPayload[keyword.ID] = keyword.tags.filter((t) => t !== tag.trim());
         }
      });
      if (Object.keys(tagsPayload).length > 0) {
         updateMutate({ tags: tagsPayload });
      }
   };

   const title = isSingle ? `Tags for Keyword "${keywords[0].keyword}"` : `Tags for ${keywords.length} Selected Keywords`;

   return (
      <Modal closeModal={() => { closeModal(false); }} title={title}>
         <div className="text-sm my-8 ">
            {tags.length > 0 && (
               <ul>
                  {tags.map((tag:string) => <li key={tag} className={'inline-block bg-slate-50 py-1 px-3 border rounded mr-4 mb-3 text-slate-500'}>
                                 <Icon type="tags" size={14} classes="mr-2" />{tag}
                                 <button
                                 className="ml-1 cursor-pointer rounded px-1 hover:bg-red-200 hover:text-red-700"
                                 onClick={() => removeTag(tag)}>
                                    <Icon type="close" size={14} />
                                 </button>
                           </li>)}
                  <li className='inline-block py-1 px-1'>
                     <button
                     title='Add New Tag'
                     className="cursor-pointer rounded p-1 px-3 bg-indigo-600 text-white font-semibold text-sm"
                     onClick={() => setShowAddTag(true)}>+</button>
                  </li>
               </ul>
            )}
            {tags.length === 0 && (
               <div className="text-center w-full text-gray-500">
                  No Tags Added to {isSingle ? 'this Keyword' : 'these Keywords'}. <button className=' text-indigo-600' onClick={() => setShowAddTag(true)}>+ Add Tag</button>
               </div>
            )}
         </div>
         {showAddTag && keywords.length > 0 && (
            <AddTags
               existingTags={allTags}
               keywords={keywords}
               closeModal={() => setShowAddTag(false)}
               />
         )}
      </Modal>
   );
};

export default KeywordTagManager;
