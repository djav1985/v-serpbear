'use client';

import { Button } from 'components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/ui/card';

type Props = { requestId: string, clientName: string, callbackHost: string, error: string };

export function OAuthApprovalForm({ requestId, clientName, callbackHost, error: initialError }: Props) {
   return (
      <Card>
         <CardHeader>
            <CardTitle className="text-base">Connect to SerpBear</CardTitle>
            <p className="text-muted-foreground text-sm">Authorize this MCP client to read your SerpBear account.</p>
         </CardHeader>
         <CardContent>
            <div className="mb-5 rounded-lg border bg-muted/40 p-3 text-sm">
               <p><span className="text-muted-foreground">Client: </span><span className="font-medium">{clientName}</span></p>
               <p className="mt-1 break-all"><span className="text-muted-foreground">Returns to: </span>{callbackHost}</p>
               <p className="text-muted-foreground mt-3">You are signed in to SerpBear. Access is limited to its existing read-only MCP tools.</p>
            </div>
            <form action="/api/oauth/authorize" method="post" className="flex flex-col gap-4">
               <input type="hidden" name="request" value={requestId} />
               <p className="text-muted-foreground text-sm">Your SerpBear login authorizes this connection.</p>
               {initialError && <p role="alert" className="text-destructive text-sm">{initialError}</p>}
               <Button type="submit" name="decision" value="approve" className="w-full">Approve connection</Button>
               <Button type="submit" name="decision" value="deny" formNoValidate variant="outline" className="w-full">Cancel</Button>
            </form>
         </CardContent>
      </Card>
   );
}
