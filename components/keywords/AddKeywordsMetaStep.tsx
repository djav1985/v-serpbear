import { useState } from 'react';
import Modal from '../common/Modal';
import TagInput from './TagInput';
import LocationPicker from './LocationPicker';

type AddKeywordsMetaStepProps = {
   selectedCount: number,
   existingTags: string[],
   existingLocations: string[],
   allowsCity: boolean,
   isAdding?: boolean,
   onConfirm: (details: { tags: string[], location: string, country: string }) => void,
   closeModal: () => void,
}

const parseTags = (input: string): string[] => [...new Set(
   input.split(',').map((tag) => tag.trim()).filter((tag) => tag.length > 0),
)];

// Step shown between selecting keywords and adding them to the tracker: choose tags and a location
const AddKeywordsMetaStep = ({
   selectedCount,
   existingTags,
   existingLocations,
   allowsCity,
   isAdding = false,
   onConfirm,
   closeModal,
}: AddKeywordsMetaStepProps) => {
   const [tagInput, setTagInput] = useState('');
   // Nothing is picked until the user chooses a location or adds a country-only choice
   const [selection, setSelection] = useState<{ location: string, country: string } | null>(null);

   return (
      <Modal
         closeModal={closeModal}
         title={`Add ${selectedCount} Keyword${selectedCount > 1 ? 's' : ''} to Tracker`}
         width="[340px]"
      >
         <div data-testid="add_meta_step">
            <p className='text-sm font-semibold text-gray-500 mb-1'>Tags</p>
            <TagInput
               value={tagInput}
               onChange={setTagInput}
               existingTags={existingTags}
               placeholder='Insert Tags (Optional). eg: tag1, tag2'
            />
            <div className='mt-4'>
            <LocationPicker
               existingLocations={existingLocations}
               value={selection?.location ?? ''}
               onChange={(location, country) => setSelection({ location, country })}
               allowsCity={allowsCity}
               sectionLabels={true}
               defaultCountry='US'
            />
            </div>
            <div className='mt-6 text-right text-sm font-semibold flex justify-between'>
               <button
                  type='button'
                  className=' py-2 px-5 rounded cursor-pointer bg-indigo-50 text-slate-500 mr-3'
                  onClick={closeModal}>
                  Cancel
               </button>
               <button
                  type='button'
                  className=' py-2 px-5 min-w-[80px] text-center text-sm font-semibold rounded cursor-pointer bg-blue-700 text-white'
                  disabled={isAdding}
                  onClick={() => onConfirm({ tags: parseTags(tagInput), location: selection?.location ?? '', country: selection?.country ?? '' })}>
                  {isAdding ? 'Adding....' : 'Track'}
               </button>
            </div>
         </div>
      </Modal>
   );
};

export default AddKeywordsMetaStep;
