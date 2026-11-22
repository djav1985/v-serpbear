'use client';

import { useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from 'components/ui/input';
import { cn } from 'lib/utils';
import { SECRET_MARKER } from 'utils/settingsSecrets';

/**
 * The server never sends a stored secret, only the marker. A field holding the marker is shown empty with a
 * "saved" hint, so the marker is never visible or editable. Typing replaces it; leaving it alone keeps the stored value.
 */
export const savedSecretProps = (value: string | undefined, placeholder?: string): { value: string; placeholder?: string } => (
   value === SECRET_MARKER ? { value: '', placeholder: 'Saved. Type to replace.' } : { value: value ?? '', placeholder }
);

/** A password-style field with a show/hide button, for API keys and tokens. */
export function SecretInput({ className, value, placeholder, ...props }: Omit<ComponentProps<typeof Input>, 'type' | 'value'> & { value?: string }) {
   const [visible, setVisible] = useState(false);
   return (
      <div className="relative w-full">
         <Input {...props} {...savedSecretProps(value, placeholder)} type={visible ? 'text' : 'password'} autoComplete="off" className={cn('pr-9', className)} />
         <button
            type="button"
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
            aria-label={visible ? 'Hide value' : 'Show value'}
            onClick={() => setVisible(!visible)}
         >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
         </button>
      </div>
   );
}
