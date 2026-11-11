'use client';

import { Button } from 'components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/ui/card';
import { Input } from 'components/ui/input';
import { Label } from 'components/ui/label';

type Props = { requestId: string, clientName: string, callbackHost: string, platformName: string, readOnlyRequested: boolean, error: string, sessionUser: string | null };

export function OAuthApprovalForm({ requestId, clientName, callbackHost, platformName, readOnlyRequested, error: initialError, sessionUser }: Props) {
   return (
      <Card>
         <CardHeader>
            <CardTitle className="text-base">Connect to {platformName}</CardTitle>
            <p className="text-muted-foreground text-sm">Authorize this MCP client to access your {platformName} account.</p>
         </CardHeader>
         <CardContent>
            <div className="mb-5 rounded-lg border bg-muted/40 p-3 text-sm">
               <p><span className="text-muted-foreground">Client: </span><span className="font-medium">{clientName}</span></p>
               <p className="mt-1 break-all"><span className="text-muted-foreground">Returns to: </span>{callbackHost}</p>
               <p className="text-muted-foreground mt-3">Choose the access level for this MCP connection.</p>
            </div>
            <form
               action="/api/oauth/authorize"
               method="post"
               onSubmit={(event) => {
                  // Resolve against the page origin so a proxy-injected <base> URL
                  // cannot turn this into a cross-origin form submission blocked by CSP.
                  event.currentTarget.action = new URL('/api/oauth/authorize', window.location.origin).toString();
               }}
               className="flex flex-col gap-4"
            >
               <input type="hidden" name="request" value={requestId} />
               {sessionUser ? (
                  <p className="rounded-lg border bg-muted/40 p-3 text-sm">You’re logged in as <span className="font-medium">{sessionUser}</span>.</p>
               ) : (
                  <>
                     <div className="flex flex-col gap-2">
                        <Label htmlFor="oauth-username">Username</Label>
                        <Input id="oauth-username" name="username" type="text" autoComplete="username" autoFocus required />
                     </div>
                     <div className="flex flex-col gap-2">
                        <Label htmlFor="oauth-password">Password</Label>
                        <Input id="oauth-password" name="password" type="password" autoComplete="current-password" required />
                     </div>
                  </>
               )}
               <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="read_only" value="1" defaultChecked={readOnlyRequested} />
                  <span>Read-only access (recommended)</span>
               </label>
               {!sessionUser && <p className="text-muted-foreground text-xs">Use the SerpBear username and password configured on the server.</p>}
               {initialError && <p role="alert" className="text-destructive text-sm">{initialError}</p>}
               <Button type="submit" name="decision" value="approve" variant="primaryAction" className="h-10 w-full text-base">Approve connection</Button>
               <Button type="submit" name="decision" value="deny" formNoValidate variant="dangerAction" className="h-10 w-full text-base">Cancel</Button>
            </form>
         </CardContent>
      </Card>
   );
}
