import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SecretInput, savedSecretProps } from '../../app/(dashboard)/_components/secret-input';
import { SECRET_MARKER } from '../../utils/settingsSecrets';

describe('SecretInput', () => {
   it('never shows the stored-secret marker', () => {
      render(<SecretInput aria-label="Key" placeholder="API Key" value={SECRET_MARKER} onChange={() => {}} />);

      const input = screen.getByLabelText('Key') as HTMLInputElement;
      expect(input.value).toBe('');
      expect(input.placeholder).toBe('Saved. Type to replace.');
      fireEvent.click(screen.getByRole('button', { name: 'Show value' }));
      expect(input.value).toBe('');
   });

   it('shows a typed value and the normal placeholder when nothing is stored', () => {
      render(<SecretInput aria-label="Key" placeholder="API Key" value="abc" onChange={() => {}} />);

      const input = screen.getByLabelText('Key') as HTMLInputElement;
      expect(input.value).toBe('abc');
      expect(input.placeholder).toBe('API Key');
   });

   it('replaces the marker with what is typed instead of appending to it', () => {
      const Harness = () => {
         const [value, setValue] = useState(SECRET_MARKER);
         return <><SecretInput aria-label="Key" value={value} onChange={(event) => setValue(event.target.value)} /><output data-testid="state">{value}</output></>;
      };
      render(<Harness />);

      fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'new-key' } });

      expect(screen.getByTestId('state').textContent).toBe('new-key');
      expect((screen.getByLabelText('Key') as HTMLInputElement).value).toBe('new-key');
   });
});

describe('savedSecretProps', () => {
   it('blanks the marker and keeps real values', () => {
      expect(savedSecretProps(SECRET_MARKER, 'x')).toEqual({ value: '', placeholder: 'Saved. Type to replace.' });
      expect(savedSecretProps('real', 'x')).toEqual({ value: 'real', placeholder: 'x' });
      expect(savedSecretProps(undefined, 'x')).toEqual({ value: '', placeholder: 'x' });
   });
});
