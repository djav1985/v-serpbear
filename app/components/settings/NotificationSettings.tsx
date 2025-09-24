/// <reference path="../../types.d.ts" />

import React from 'react';
import SelectField from '../common/SelectField';
import SecretField from '../common/SecretField';
import InputField from '../common/InputField';
import Icon from '../common/Icon';
import { useSendNotifications } from '../../services/settings';
import { hasTrimmedLength } from '../../utils/security';

type NotificationSettingsProps = {
   settings: SettingsType,
   settingsError: null | {
      type: string,
      msg: string
   },
   updateSettings: Function,
}

const NotificationSettings = ({ settings, settingsError, updateSettings }:NotificationSettingsProps) => {
   const { mutate: triggerNotifications, isLoading: sendingNotifications } = useSendNotifications();

   const sanitizedNotificationEmails = (settings.notification_email || '')
      .split(',')
      .map((email) => email.trim())
      .filter((email) => email.length > 0);
   const hasNotificationEmails = sanitizedNotificationEmails.length > 0;
   const hasSmtpServer = hasTrimmedLength(settings.smtp_server);
   const hasSmtpPort = hasTrimmedLength(settings.smtp_port);
   const canSendNotifications = settings.notification_interval !== 'never'
      && hasSmtpServer
      && hasSmtpPort
      && hasNotificationEmails;

   const manualTriggerHelpId = 'manual-notification-help';
   const manualTriggerStatusId = 'manual-notification-status';
   const manualTriggerDescription = 'Send a notification email immediately to confirm your SMTP credentials '
      + 'and recipient list.';
   const manualTriggerStatus = sendingNotifications
      ? 'Sending notifications…'
      : canSendNotifications
         ? 'Ready to send notifications immediately.'
         : 'Update your SMTP and notification settings to enable manual sends.';
   const manualTriggerAriaDescription = `${manualTriggerHelpId} ${manualTriggerStatusId}`;

   const handleSendNotifications = () => {
      triggerNotifications();
   };

   const sendNotificationsButtonClasses = [
      'py-3 px-5 w-full rounded cursor-pointer bg-blue-600 text-white font-semibold text-sm transition-colors',
      'flex items-center justify-center gap-2 hover:bg-blue-700',
      'disabled:cursor-not-allowed disabled:bg-blue-300',
   ].join(' ');

   return (
      <div>
         <div className='settings__content styled-scrollbar p-6 text-sm'>
            <div className="settings__section__input mb-5">
               <SelectField
               label='Notification Frequency'
                  multiple={false}
                  selected={[settings.notification_interval]}
                  options={[
                     { label: 'Daily', value: 'daily' },
                     { label: 'Weekly', value: 'weekly' },
                     { label: 'Monthly', value: 'monthly' },
                     { label: 'Never', value: 'never' },
                  ]}
                  defaultLabel={'Notification Settings'}
                  updateField={(updated:string[]) => updated[0] && updateSettings('notification_interval', updated[0])}
                  rounded='rounded'
                  maxHeight={48}
                  minWidth={220}
               />
            </div>
            {settings.notification_interval !== 'never' && (
               <>
                  <div className="settings__section__input mb-5">
                     <InputField
                     label='Notification Emails'
                     hasError={settingsError?.type === 'no_email'}
                     value={settings?.notification_email}
                     placeholder={'test@gmail.com, test2@test.com'}
                     onChange={(value:string) => updateSettings('notification_email', value)}
                     />
                  </div>
                  <div className="settings__section__input mb-5">
                     <InputField
                     label='SMTP Server'
                     hasError={settingsError?.type === 'no_smtp_server'}
                     value={settings?.smtp_server || ''}
                     placeholder={'test@gmail.com, test2@test.com'}
                     onChange={(value:string) => updateSettings('smtp_server', value)}
                     />
                  </div>
                  <div className="settings__section__input mb-5">
                     <InputField
                     label='SMTP TLS Certificate Hostname (optional)'
                     value={settings?.smtp_tls_servername || ''}
                     placeholder={'mail.example.com'}
                     onChange={(value:string) => updateSettings('smtp_tls_servername', value)}
                     />
                  </div>
                  <div className="settings__section__input mb-5">
                     <InputField
                     label='SMTP Port'
                     hasError={settingsError?.type === 'no_smtp_port'}
                     value={settings?.smtp_port || ''}
                     placeholder={'2234'}
                     onChange={(value:string) => updateSettings('smtp_port', value)}
                     />
                  </div>
                  <div className="settings__section__input mb-5">
                     <InputField
                        label='SMTP Username'
                        hasError={settingsError?.type === 'no_smtp_port'}
                        value={settings?.smtp_username || ''}
                        onChange={(value:string) => updateSettings('smtp_username', value)}
                        />
                  </div>
                  <div className="settings__section__input mb-5">
                     <SecretField
                     label='SMTP Password'
                     value={settings?.smtp_password || ''}
                     onChange={(value:string) => updateSettings('smtp_password', value)}
                     />
                  </div>
                  <div className="settings__section__input mb-5">
                        <InputField
                        label='From Email Address'
                        hasError={settingsError?.type === 'no_smtp_from'}
                        value={settings?.notification_email_from || ''}
                        placeholder="no-reply@mydomain.com"
                        onChange={(value:string) => updateSettings('notification_email_from', value)}
                        />
                  </div>
                  <div className="settings__section__input mb-5">
                        <InputField
                        label='Email From Name'
                        hasError={settingsError?.type === 'no_smtp_from'}
                        value={settings?.notification_email_from_name || 'Serpbear'}
                        placeholder="Serpbear"
                        onChange={(value:string) => updateSettings('notification_email_from_name', value)}
                        />
                  </div>
                  <div className="settings__section__input mb-5">
                     <p id={manualTriggerHelpId} className='text-xs text-slate-600 mb-2'>
                        {manualTriggerDescription}
                     </p>
                     <p id={manualTriggerStatusId} className='sr-only' aria-live='polite'>
                        {manualTriggerStatus}
                     </p>
                     <button
                        type='button'
                        aria-describedby={manualTriggerAriaDescription}
                        aria-busy={sendingNotifications}
                        onClick={handleSendNotifications}
                        disabled={!canSendNotifications || sendingNotifications}
                        className={sendNotificationsButtonClasses}
                     >
                        {sendingNotifications && <Icon type="loading" size={14} />}
                        Send Notifications Now
                     </button>
                  </div>
               </>
            )}

            </div>
            {settingsError?.msg && (
               <div
                  className={[
                     'absolute w-full bottom-16 text-center',
                     'p-3 bg-red-100 text-red-600 text-sm font-semibold',
                  ].join(' ')}
               >
                  {settingsError.msg}
               </div>
            )}
      </div>
   );
};

export default NotificationSettings;
