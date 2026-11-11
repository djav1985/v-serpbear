import { render, screen } from '@testing-library/react';
import { OAuthApprovalForm } from '../../app/(auth)/oauth/approve/_components/oauth-approval-form';

describe('OAuth approval access choice', () => {
   it('preselects read-only when the client requested the read scope', () => {
      render(<OAuthApprovalForm requestId="request" clientName="ChatGPT" callbackHost="chatgpt.com" readOnlyRequested error="" />);

      expect(screen.getByRole('checkbox', { name: /read-only access/i })).toBeChecked();
   });

   it('leaves full access selected by default for a full-scope request', () => {
      render(<OAuthApprovalForm requestId="request" clientName="ChatGPT" callbackHost="chatgpt.com" readOnlyRequested={false} error="" />);

      expect(screen.getByRole('checkbox', { name: /read-only access/i })).not.toBeChecked();
   });
});
