import type { Metadata } from 'next';
import { getBranding } from 'utils/branding';
import { logger } from 'utils/logger';
import { getSessionUser } from 'utils/serverSession';
import { findActiveAuthorizationRequest, MCP_SCOPE_READ, readClient } from 'utils/mcpOAuth';
import { Brand } from 'app/_components/brand';
import { OAuthApprovalForm } from './_components/oauth-approval-form';

export const metadata: Metadata = { title: 'Authorize MCP Connection' };

type PageProps = { searchParams: Promise<{ request?: string, error?: string }> };
const approvalErrors: Record<string, string> = {
   incorrect_credentials: 'The username or password is incorrect.',
   credentials_unconfigured: 'The server username or password is not configured.',
   too_many_attempts: 'Too many incorrect sign-in attempts. Wait 15 minutes and try again.',
   invalid_decision: 'Choose approve or cancel.',
   invalid_origin: 'For your security, approve this connection from the SerpBear approval page.',
};

export default async function OAuthApprovalPage({ searchParams }: PageProps) {
   const { request = '', error = '' } = await searchParams;
   const branding = getBranding();
   const sessionUser = await getSessionUser();
   let clientName = '';
   let callbackHost = '';
   let requestValid = false;
   let readOnlyRequested = false;

   if (request) {
      try {
         const pending = await findActiveAuthorizationRequest(request);
         if (pending && pending.redirectUri) {
            const client = await readClient(pending.clientId);
            try {
               callbackHost = new URL(pending.redirectUri).host;
               clientName = client?.clientName || 'MCP client';
               readOnlyRequested = pending.scope === MCP_SCOPE_READ;
               requestValid = !!client;
               if (requestValid) {
                  logger.info('[OAuth] Approval page loaded for a pending client request.', { operation: 'authorization_approval', callbackHost });
               }
            } catch (_error) {
               requestValid = false;
            }
         }
      } catch (error) {
         logger.error('[OAuth] Failed to read approval state from the OAuth data file.', error instanceof Error ? error : new Error(String(error)), { operation: 'authorization_approval' });
      }
   }
   if (request && !requestValid) { logger.error('[OAuth] Approval page could not load the authorization request.', undefined, { operation: 'authorization_approval', reason: 'missing_or_expired_request' }); }

   const message = approvalErrors[error] ?? '';

   return (
      <main className="bg-muted/40 flex min-h-screen items-center justify-center p-4">
         <div className="w-full max-w-sm">
            <h1 className="text-primary mb-6 text-center text-2xl font-semibold">
               <span className="sr-only">Authorize MCP connection to </span>
               <Brand branding={branding} markSize={30} />
            </h1>
            {requestValid ? (
               <OAuthApprovalForm
                  requestId={request}
                  clientName={clientName}
                  callbackHost={callbackHost}
                  platformName={branding.platformName}
                  readOnlyRequested={readOnlyRequested}
                  error={message}
                  sessionUser={sessionUser}
               />
            ) : (
               <section className="bg-card text-card-foreground rounded-xl border p-6 shadow-sm">
                  <h2 className="text-base font-semibold">Connection request expired</h2>
                  <p className="text-muted-foreground mt-2 text-sm">Return to ChatGPT and start connecting {branding.platformName} again.</p>
               </section>
            )}
         </div>
      </main>
   );
}
