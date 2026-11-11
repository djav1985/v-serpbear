import { render, screen } from '@testing-library/react';
import { OAuthApprovalForm } from '../../app/api/oauth/approve/_components/oauth-approval-form';

describe('OAuth approval access choice', () => {
   it('preselects read-only when the client requested the read scope', () => {
      render(<OAuthApprovalForm requestId="request" clientName="ChatGPT" callbackHost="chatgpt.com" platformName="SerpBear" readOnlyRequested error="" sessionUser={null} />);

      expect(screen.getByRole('checkbox', { name: /read-only access/i })).toBeChecked();
   });

   it('leaves full access selected by default for a full-scope request', () => {
      render(<OAuthApprovalForm requestId="request" clientName="ChatGPT" callbackHost="chatgpt.com" platformName="SerpBear" readOnlyRequested={false} error="" sessionUser={null} />);

      expect(screen.getByRole('checkbox', { name: /read-only access/i })).not.toBeChecked();
   });

   it('shows username and password fields for a signed-out visitor', () => {
      render(<OAuthApprovalForm requestId="request" clientName="ChatGPT" callbackHost="chatgpt.com" platformName="SerpBear" readOnlyRequested error="" sessionUser={null} />);

      expect(screen.getByLabelText('Username')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
   });

   it('shows the signed-in account and hides credentials for a valid session', () => {
      render(<OAuthApprovalForm requestId="request" clientName="ChatGPT" callbackHost="chatgpt.com" platformName="SerpBear" readOnlyRequested error="" sessionUser="admin" />);

      expect(screen.getByText((_content, element) => element?.tagName === 'P' && element.textContent?.includes('You’re logged in as admin') === true)).toBeInTheDocument();
      expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
   });
});
