import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getBranding } from 'utils/branding';
import { logger } from 'utils/logger';
import { Brand } from 'app/_components/brand';
import { verifySessionToken } from 'utils/verifyUser';
import { findActiveAuthorizationRequest, readClient } from 'utils/mcpOAuth';
import { OAuthApprovalForm } from './_components/oauth-approval-form';

export const metadata: Metadata = { title: 'Authorize MCP Connection' };

type PageProps = { searchParams: Promise<{ request?: string, error?: string }> };

export default async function OAuthApprovalPage({ searchParams }: PageProps) {
   const { request = '', error = '' } = await searchParams;
   const branding = getBranding();
   let clientName = '';
   let callbackHost = '';
   let requestValid = false;

   if (request) {
      const cookieStore = await cookies();
      const session = cookieStore.get('token')?.value;
      try {
         if (!session) { throw new Error('No login session'); }
         verifySessionToken(session);
      } catch (_error) {
         redirect(`/login?next=${encodeURIComponent(`/oauth/approve?request=${request}`)}`);
      }
      try {
         const pending = await findActiveAuthorizationRequest(request);
         if (pending && pending.redirectUri) {
            const client = await readClient(pending.clientId);
            try {
               callbackHost = new URL(pending.redirectUri).host;
               clientName = client?.clientName || 'MCP client';
               requestValid = !!client;
            } catch (_error) {
               requestValid = false;
            }
         }
      } catch (error) {
         logger.error('[OAuth] Failed to read approval state from the OAuth data file.', error instanceof Error ? error : new Error(String(error)), { operation: 'authorization_approval' });
      }
   }
   if (request && !requestValid) { logger.error('[OAuth] Approval page could not load the authorization request.', undefined, { operation: 'authorization_approval', reason: 'missing_or_expired_request' }); }

   const message = error === 'session_expired' ? 'Your login session expired. Sign in again to approve this connection.' : '';

   return (
      <main className="bg-muted/40 flex min-h-screen items-center justify-center p-4">
         <div className="w-full max-w-sm">
            <h1 className="text-primary mb-6 text-center text-2xl font-semibold">
               <span className="sr-only">Authorize MCP connection to </span>
               <Brand branding={branding} markSize={30} />
            </h1>
            {requestValid ? (
               <OAuthApprovalForm requestId={request} clientName={clientName} callbackHost={callbackHost} error={message} />
            ) : (
               <section className="bg-card text-card-foreground rounded-xl border p-6 shadow-sm">
                  <h2 className="text-base font-semibold">Connection request expired</h2>
                  <p className="text-muted-foreground mt-2 text-sm">Return to ChatGPT and start connecting SerpBear again.</p>
               </section>
            )}
         </div>
      </main>
   );
}
