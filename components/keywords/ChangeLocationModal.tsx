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

// Bulk "Change Location" for the selected tracked keywords, following the AddTags modal layout
const ChangeLocationModal = ({ keywords = [], existingLocations = [], allowsCity = false, closeModal }: ChangeLocationModalProps) => {
   const [location, setLocation] = useState('');
   const { mutate: updateLocation, isLoading } = useUpdateKeywordLocation(() => closeModal());

   const applyLocation = () => {
      if (keywords.length === 0 || !location) { return; }
      updateLocation({ keywordIDs: keywords.map((keyword) => keyword.ID), location });
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
               value={location}
               onChange={setLocation}
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
                  className={`py-2 px-5 min-w-[80px] text-center rounded cursor-pointer bg-blue-700 text-white ${!location ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={!location || isLoading}
                  onClick={applyLocation}>
                  {isLoading ? 'Applying....' : 'Apply'}
               </button>
            </div>
         </div>
      </Modal>
   );
};

export default ChangeLocationModal;
