import React, { forwardRef, useState } from 'react';
import Modal from '../common/Modal';
import { useAddDomain } from '../../services/domains';
import { isValidUrl } from '../../utils/client/validators';
import { normalizeHostFromString } from '../../utils/validators/hostname';

type AddDomainProps = {
   domains: DomainType[],
   closeModal: Function
}

const AddDomain = forwardRef<HTMLDivElement, AddDomainProps>(({ closeModal, domains = [] }: AddDomainProps, ref) => {
   const [newDomain, setNewDomain] = useState<string>('');
   const [newDomainError, setNewDomainError] = useState('');
   const { mutate: addMutate, isLoading: isAdding } = useAddDomain(() => closeModal());

   const addDomain = () => {
      setNewDomainError('');
      const existingDomains = new Set(domains.map((d) => d.domain));
      const insertedURLs = newDomain.split('\n');
      const domainsTobeAdded = new Set<string>();
      const invalidDomains:string[] = [];
      let duplicateCount = 0;
      insertedURLs.forEach((url) => {
        const theURL = url.trim();
        if (!theURL) { return; }
        if (isValidUrl(theURL)) {
         const cleanedURL = normalizeHostFromString(theURL);
         if (!cleanedURL) {
            invalidDomains.push(theURL);
            return;
         }

         if (existingDomains.has(cleanedURL) || domainsTobeAdded.has(cleanedURL)) {
            duplicateCount += 1;
            return;
         }

         domainsTobeAdded.add(cleanedURL);
        } else {
         invalidDomains.push(theURL);
        }
      });
      if (invalidDomains.length > 0) {
         setNewDomainError(`Please Insert Valid Website URL. ${invalidDomains.length > 1 ? `Invalid URLs: ${invalidDomains.join(', ')}` : ''}`);
      } else if (domainsTobeAdded.size > 0) {
            const uniqueDomains = Array.from(domainsTobeAdded);
         addMutate(uniqueDomains);
      } else if (duplicateCount > 0) {
         setNewDomainError('All provided domains are already tracked or duplicates.');
      }
   };

   const handleDomainInput = (e:React.ChangeEvent<HTMLTextAreaElement>) => {
      if (e.currentTarget.value === '' && newDomainError) { setNewDomainError(''); }
      setNewDomain(e.currentTarget.value);
   };

   return (
      <Modal ref={ref} closeModal={() => { closeModal(false); }} title={'Add New Domain'}>
         <div data-testid="adddomain_modal">
            <h4 className='text-sm mt-4 pb-2'>Website URL(s)</h4>
            <textarea
               className={`w-full h-40 border rounded border-gray-200 p-4 outline-none
                focus:border-indigo-300 ${newDomainError ? ' border-red-400 focus:border-red-400' : ''}`}
               placeholder={'Type or Paste URLs here. Insert Each URL in a New line. eg: \nhttps://mysite.com/ \nhttps://anothersite.com/ '}
               value={newDomain}
               autoFocus={true}
               onChange={handleDomainInput}>
            </textarea>
            {newDomainError && <div><span className=' ml-2 block float-right text-red-500 text-xs font-semibold'>{newDomainError}</span></div>}
            <div className='mt-6 text-right text-sm font-semibold'>
               <button className='py-2 px-5 rounded cursor-pointer bg-indigo-50 text-slate-500 mr-3' onClick={() => closeModal(false)}>Cancel</button>
               <button className='py-2 px-5 rounded cursor-pointer bg-blue-700 text-white' onClick={() => !isAdding && addDomain() }>
                   {isAdding ? 'Adding....' : 'Add Domain'}
               </button>
            </div>
         </div>
      </Modal>
   );
});

AddDomain.displayName = 'AddDomain';

export default AddDomain;
