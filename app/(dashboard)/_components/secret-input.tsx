'use client';

import { useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from 'components/ui/input';
import { cn } from 'lib/utils';

/** A password-style field with a show/hide button, for API keys and tokens. */
export function SecretInput({ className, ...props }: Omit<ComponentProps<typeof Input>, 'type'>) {
   const [visible, setVisible] = useState(false);
   return (
      <div className="relative w-full">
         <Input {...props} type={visible ? 'text' : 'password'} autoComplete="off" className={cn('pr-9', className)} />
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
