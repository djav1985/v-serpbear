'use client';

import { Button } from 'components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/ui/card';
import { Input } from 'components/ui/input';
import { Label } from 'components/ui/label';

type Props = { requestId: string, clientName: string, callbackHost: string, platformName: string, readOnlyRequested: boolean, error: string };

export function OAuthApprovalForm({ requestId, clientName, callbackHost, platformName, readOnlyRequested, error: initialError }: Props) {
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
            <form action="/api/oauth/authorize" method="post" className="flex flex-col gap-4">
               <input type="hidden" name="request" value={requestId} />
               <div className="flex flex-col gap-2">
                  <Label htmlFor="mcp-apikey">Server API key (MCP_APIKEY)</Label>
                  <Input id="mcp-apikey" name="token" type="password" autoComplete="off" autoFocus required />
               </div>
               <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="read_only" value="1" defaultChecked={readOnlyRequested} />
                  <span>Read-only access (recommended)</span>
               </label>
               <p className="text-muted-foreground text-xs">This is the same key used for direct MCP access.</p>
               {initialError && <p role="alert" className="text-destructive text-sm">{initialError}</p>}
               <Button type="submit" name="decision" value="approve" variant="primaryAction" className="h-10 w-full text-base">Approve connection</Button>
               <Button type="submit" name="decision" value="deny" formNoValidate variant="outline" className="h-10 w-full border-red-600 bg-red-600 text-base text-white hover:border-red-500 hover:bg-red-500 hover:text-white active:bg-red-700 focus-visible:border-red-700 focus-visible:ring-red-600/40">Cancel</Button>
            </form>
         </CardContent>
      </Card>
   );
}
