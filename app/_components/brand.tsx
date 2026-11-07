import Image from 'next/image';
import Icon from 'components/common/Icon';
import { buildLogoUrl, type BrandingConfig } from 'utils/branding';
import { cn } from 'lib/utils';

type BrandProps = {
   branding: BrandingConfig;
   className?: string;
   markSize?: number;
};

/** Logo plus platform name. Branding arrives as props from the server, never from a client hook. */
export function Brand({ branding, className, markSize = 24 }: BrandProps) {
   const { hasCustomLogo, platformName } = branding;
   const logoUrl = buildLogoUrl(branding);

   return (
      <span className={cn('inline-flex items-center gap-2', className)}>
         {hasCustomLogo && logoUrl ? (
            <Image
               src={logoUrl}
               alt={`${platformName} logo`}
               width={markSize}
               height={markSize}
               unoptimized
               className="inline-block align-middle"
            />
         ) : (
            <Icon type="logo" size={markSize} color="currentColor" classes="text-primary" />
         )}
         <span>{platformName}</span>
      </span>
   );
}
