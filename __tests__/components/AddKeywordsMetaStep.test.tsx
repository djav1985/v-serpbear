import { fireEvent, render, screen } from '@testing-library/react';
import AddKeywordsMetaStep from '../../components/keywords/AddKeywordsMetaStep';
import AddToTrackerBar from '../../components/keywords/AddToTrackerBar';
import ChangeLocationModal from '../../components/keywords/ChangeLocationModal';
import { useUpdateKeywordLocation } from '../../services/keywords';

jest.mock('../../services/keywords', () => ({
   useUpdateKeywordLocation: jest.fn(),
}));

const mockUseUpdateKeywordLocation = useUpdateKeywordLocation as unknown as jest.Mock;

const baseKeyword = { ID: 1, keyword: 'alpha', country: 'US', location: '', tags: [] } as unknown as KeywordType;

describe('AddKeywordsMetaStep', () => {
   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('confirms with parsed tags and the default location when nothing is chosen', () => {
      const onConfirm = jest.fn();
      render(
         <AddKeywordsMetaStep
            selectedCount={2}
            existingTags={['seo']}
            existingLocations={[]}
            allowsCity={false}
            onConfirm={onConfirm}
            closeModal={jest.fn()}
         />,
      );

      fireEvent.change(screen.getByPlaceholderText('Insert Tags (Optional). eg: tag1, tag2'), { target: { value: 'seo, , content ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Track' }));

      expect(onConfirm).toHaveBeenCalledWith({ tags: ['seo', 'content'], location: 'US' });
   });

   it('shows the city and state error and does not add a location when only one is filled', () => {
      render(
         <AddKeywordsMetaStep
            selectedCount={1}
            existingTags={[]}
            existingLocations={['US']}
            allowsCity={true}
            onConfirm={jest.fn()}
            closeModal={jest.fn()}
         />,
      );

      fireEvent.change(screen.getByPlaceholderText(/City \(Optional/), { target: { value: 'Austin' } });
      fireEvent.click(screen.getAllByRole('button', { name: 'Add' }).at(0) as HTMLElement);

      expect(screen.getByText('City and state must be provided together.')).toBeInTheDocument();
   });

   it('adds a new city, state and country location and confirms with it', () => {
      const onConfirm = jest.fn();
      render(
         <AddKeywordsMetaStep
            selectedCount={1}
            existingTags={[]}
            existingLocations={['US']}
            allowsCity={true}
            onConfirm={onConfirm}
            closeModal={jest.fn()}
         />,
      );

      fireEvent.change(screen.getByPlaceholderText(/City \(Optional/), { target: { value: 'Austin' } });
      fireEvent.change(screen.getByPlaceholderText(/State \(Optional/), { target: { value: 'TX' } });
      fireEvent.click(screen.getAllByRole('button', { name: 'Add' }).at(0) as HTMLElement);
      fireEvent.click(screen.getByRole('button', { name: 'Track' }));

      expect(onConfirm).toHaveBeenCalledWith({ tags: [], location: 'Austin,TX,US' });
   });

   it('labels the location as existing locations with an add location section', () => {
      render(
         <AddKeywordsMetaStep
            selectedCount={1}
            existingTags={[]}
            existingLocations={['US']}
            allowsCity={true}
            onConfirm={jest.fn()}
            closeModal={jest.fn()}
         />,
      );

      expect(screen.getByText('Existing Locations')).toBeInTheDocument();
      expect(screen.getByText('Add Location')).toBeInTheDocument();
      expect(screen.queryByText('Location')).not.toBeInTheDocument();
   });

   it('cancels through the Cancel button', () => {
      const closeModal = jest.fn();
      render(
         <AddKeywordsMetaStep
            selectedCount={1}
            existingTags={[]}
            existingLocations={[]}
            allowsCity={false}
            onConfirm={jest.fn()}
            closeModal={closeModal}
         />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(closeModal).toHaveBeenCalled();
   });
});

describe('AddToTrackerBar', () => {
   it('toggles desktop and mobile independently so both can be picked', () => {
      const setDevices = jest.fn();
      render(
         <AddToTrackerBar
            label='Add Keywords to Tracker'
            devices={['desktop']}
            setDevices={setDevices}
            onAdd={jest.fn()}
         />,
      );

      fireEvent.click(screen.getByRole('checkbox', { name: /Mobile/ }));
      expect(setDevices).toHaveBeenCalledWith(['desktop', 'mobile']);

      fireEvent.click(screen.getByRole('checkbox', { name: /Desktop/ }));
      expect(setDevices).toHaveBeenLastCalledWith([]);
   });

   it('marks the device toggles as pressed according to the selection', () => {
      render(
         <AddToTrackerBar
            label='Add Keywords to Tracker'
            devices={['mobile']}
            setDevices={jest.fn()}
            onAdd={jest.fn()}
         />,
      );

      expect(screen.getByRole('checkbox', { name: /Mobile/ })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('checkbox', { name: /Desktop/ })).toHaveAttribute('aria-checked', 'false');
   });

   it('marks Add as disabled when no device is selected', () => {
      render(
         <AddToTrackerBar
            label='Add Keywords to Tracker'
            devices={[]}
            setDevices={jest.fn()}
            onAdd={jest.fn()}
            addDisabled={true}
         />,
      );

      expect(screen.getByRole('button', { name: '+ Add Keyword' })).toHaveAttribute('aria-disabled', 'true');
   });
});

describe('ChangeLocationModal', () => {
   const mutateMock = jest.fn();

   beforeEach(() => {
      jest.clearAllMocks();
      mockUseUpdateKeywordLocation.mockReturnValue({ mutate: mutateMock, isLoading: false });
   });

   it('keeps Apply disabled until a location is chosen', () => {
      render(
         <ChangeLocationModal
            keywords={[baseKeyword]}
            existingLocations={['Austin,TX,US']}
            allowsCity={false}
            closeModal={jest.fn()}
         />,
      );

      expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
   });

   it('applies the chosen location to every selected keyword', () => {
      render(
         <ChangeLocationModal
            keywords={[baseKeyword, { ...baseKeyword, ID: 2 }]}
            existingLocations={['Austin,TX,US']}
            allowsCity={true}
            closeModal={jest.fn()}
         />,
      );

      fireEvent.change(screen.getByPlaceholderText(/City \(Optional/), { target: { value: 'Dallas' } });
      fireEvent.change(screen.getByPlaceholderText(/State \(Optional/), { target: { value: 'TX' } });
      fireEvent.click(screen.getAllByRole('button', { name: 'Add' }).at(0) as HTMLElement);
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

      expect(mutateMock).toHaveBeenCalledWith({ keywordIDs: [1, 2], location: 'Dallas,TX,US' });
   });
});
