import { render } from '@testing-library/react';
import Icon from '../../app/components/common/Icon';

describe('Icon Component', () => {
   it('renders without crashing', async () => {
       render(<Icon type='logo' size={24} />);
       expect(document.querySelector('svg')).toBeInTheDocument();
   });

   it('returns null when icon type is unknown', async () => {
       render(<Icon type='unknown-icon' size={24} />);
       expect(document.querySelector('svg')).not.toBeInTheDocument();
   });

   it('renders title element when title prop is provided', async () => {
       render(<Icon type='logo' size={24} title="Test Title" />);
       const titleElement = document.querySelector('svg title');
       expect(titleElement).toBeInTheDocument();
       expect(titleElement?.textContent).toBe('Test Title');
   });

   it('does not render title element when title prop is empty', async () => {
       render(<Icon type='logo' size={24} title="" />);
       const titleElement = document.querySelector('svg title');
       expect(titleElement).not.toBeInTheDocument();
   });
});
