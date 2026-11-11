'use client';

import { Loader2 } from 'lucide-react';
import { Button } from 'components/ui/button';
import { Input } from 'components/ui/input';
import { Label } from 'components/ui/label';
import {
   Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from 'components/ui/select';
import { hasTrimmedLength } from 'utils/security';
import { SecretInput } from '../secret-input';
import { useSendNotifications } from './settings-queries';
import type { SettingsTabProps } from './settings-form';

const INTERVALS = [
   { label: 'Daily', value: 'daily' }, { label: 'Weekly', value: 'weekly' }, { label: 'Monthly', value: 'monthly' }, { label: 'Never', value: 'never' },
];

function TextField({ id, label, value, onChange, placeholder, invalid }: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder?: string; invalid?: boolean }) {
   return (
      <div className="flex flex-col gap-2">
         <Label htmlFor={id}>{label}</Label>
         <Input id={id} value={value} placeholder={placeholder} aria-invalid={invalid} onChange={(event) => onChange(event.target.value)} />
      </div>
   );
}

export function NotificationTab({ settings, update, error, platformName }: SettingsTabProps) {
   const { mutate: sendNow, isPending: sending } = useSendNotifications();
   const never = settings.notification_interval === 'never';
   const canSend = !never && hasTrimmedLength(settings.smtp_server) && hasTrimmedLength(settings.smtp_port);

   return (
      <div className="flex flex-col gap-5">
         <div className="flex flex-col gap-2">
            <Label>Notification Frequency</Label>
            <Select value={settings.notification_interval} onValueChange={(v) => update('notification_interval', v)}>
               <SelectTrigger className="w-full" aria-label="Notification frequency"><SelectValue /></SelectTrigger>
               <SelectContent>{INTERVALS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
         </div>
         {!never && (
            <>
               <p className="text-muted-foreground text-xs">Notification recipients are set for each domain, in its Domain Settings.</p>
               <TextField id="smtp-server" label="SMTP Server" placeholder="smtp.example.com" invalid={error?.type === 'no_smtp_server'} value={settings.smtp_server || ''} onChange={(v) => update('smtp_server', v)} />
               <TextField id="smtp-tls" label="SMTP TLS Certificate Hostname (optional)" placeholder="mail.example.com" value={settings.smtp_tls_servername || ''} onChange={(v) => update('smtp_tls_servername', v)} />
               <TextField id="smtp-port" label="SMTP Port" placeholder="2234" invalid={error?.type === 'no_smtp_port'} value={settings.smtp_port || ''} onChange={(v) => update('smtp_port', v)} />
               <TextField id="smtp-user" label="SMTP Username" value={settings.smtp_username || ''} onChange={(v) => update('smtp_username', v)} />
               <div className="flex flex-col gap-2">
                  <Label>SMTP Password</Label>
                  <SecretInput aria-label="SMTP Password" value={settings.smtp_password || ''} onChange={(event) => update('smtp_password', event.target.value)} />
               </div>
               <TextField id="from-email" label="From Email Address" placeholder="no-reply@mydomain.com" invalid={error?.type === 'no_smtp_from'} value={settings.notification_email_from || ''} onChange={(v) => update('notification_email_from', v)} />
               <TextField id="from-name" label="Email From Name" placeholder={platformName} value={settings.notification_email_from_name || platformName} onChange={(v) => update('notification_email_from_name', v)} />
               <div className="flex flex-col gap-2">
                  <p className="text-muted-foreground text-xs">Send a notification email immediately to confirm your SMTP credentials and each domain recipient list.</p>
                  <Button disabled={!canSend || sending} aria-busy={sending} onClick={() => sendNow()}>
                     {sending && <Loader2 className="animate-spin" />}Send Notifications Now
                  </Button>
                  <p className="sr-only" aria-live="polite">
                     {sending ? 'Sending notifications…' : canSend ? 'Ready to send notifications immediately.' : 'Update your SMTP and notification settings to enable manual sends.'}
                  </p>
               </div>
            </>
         )}
      </div>
   );
}
