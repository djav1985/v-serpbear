import { useState } from 'react';
import { useUpdateKeywordLocation } from '../../services/keywords';
import Modal from '../common/Modal';
import LocationPicker from './LocationPicker';

type ChangeLocationModalProps = {
   keywords: KeywordType[],
   existingLocations: string[],
   allowsCity: boolean,
   closeModal: () => void,
}

type LocationSelection = { location: string, country: string };

// Bulk "Change Location" for the selected tracked keywords, following the AddTags modal layout
const ChangeLocationModal = ({ keywords = [], existingLocations = [], allowsCity = false, closeModal }: ChangeLocationModalProps) => {
   // A country-only choice has a blank location, so the selection itself decides whether Apply is enabled
   const [selection, setSelection] = useState<LocationSelection | null>(null);
   const { mutate: updateLocation, isLoading } = useUpdateKeywordLocation(() => closeModal());

   const applyLocation = () => {
      if (keywords.length === 0 || !selection) { return; }
      updateLocation({ keywordIDs: keywords.map((keyword) => keyword.ID), location: selection.location, country: selection.country });
   };

   return (
      <Modal
         closeModal={closeModal}
         title={`Change Location for ${keywords.length} Keyword${keywords.length > 1 ? 's' : ''}`}
         width="[340px]"
      >
         <div data-testid="change_location_modal">
            <LocationPicker
               existingLocations={existingLocations}
               value={selection?.location ?? ''}
               onChange={(location, country) => setSelection({ location, country })}
               allowsCity={allowsCity}
               sectionLabels={true}
            />
            <div className='mt-6 text-right text-sm font-semibold flex justify-between'>
               <button
                  type='button'
                  className=' py-2 px-5 rounded cursor-pointer bg-indigo-50 text-slate-500 mr-3'
                  onClick={closeModal}>
                  Cancel
               </button>
               <button
                  type='button'
                  className={`py-2 px-5 min-w-[80px] text-center rounded cursor-pointer bg-blue-700 text-white ${!selection ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={!selection || isLoading}
                  onClick={applyLocation}>
                  {isLoading ? 'Applying....' : 'Apply'}
               </button>
            </div>
         </div>
      </Modal>
   );
};

export default ChangeLocationModal;
