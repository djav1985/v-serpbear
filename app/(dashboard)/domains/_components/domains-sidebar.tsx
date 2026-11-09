'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Globe, Plus } from 'lucide-react';
import { Button } from 'components/ui/button';
import { useShell } from '../../_components/shell-context';

/** The site's favicon, with a globe in the same space when it cannot be loaded, so the names always line up. */
function SiteIcon({ domain }: { domain: string }) {
   const [failed, setFailed] = useState(false);
   if (failed) { return <Globe className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />; }
   return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
         className="size-4 shrink-0"
         src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`}
         alt=""
         width={16}
         height={16}
         onError={() => setFailed(true)}
      />
   );
}

/** The domain list beside the Domains screen, with the Add Domain action. Shown on large screens only. */
export function DomainsSidebar() {
   const { domains, domainsFailed, openAddDomain } = useShell();
   const router = useRouter();
   return (
      <aside className="hidden lg:block" data-testid="sidebar" aria-label="Your domains">
         <div className="sticky top-24 flex flex-col gap-2">
            <h2 className="text-muted-foreground px-2 text-xs font-semibold uppercase">Your domains</h2>
            <ul className="flex max-h-96 flex-col overflow-y-auto text-sm font-medium">
               {domainsFailed && <li className="text-destructive px-2 py-1 text-xs">Could not load your domains.</li>}
               {!domainsFailed && domains.length === 0 && <li className="text-muted-foreground px-2 py-1 text-xs">No domains yet.</li>}
               {domains.map((d) => (
                  <li key={d.domain}>
                     <Link
                        href={`/domain/${d.slug}`}
                        prefetch={false}
                        onPointerEnter={() => router.prefetch(`/domain/${d.slug}`)}
                        onFocus={() => router.prefetch(`/domain/${d.slug}`)}
                        className="hover:bg-accent flex items-center gap-2 truncate rounded-md px-2 py-2"
                     >
                        <SiteIcon domain={d.domain} />
                        <span className="truncate">{d.domain}</span>
                     </Link>
                  </li>
               ))}
            </ul>
            <Button variant="ghost" size="sm" className="text-muted-foreground justify-start" data-testid="add_domain_side" onClick={openAddDomain}>
               <Plus />Add Domain
            </Button>
         </div>
      </aside>
   );
}
