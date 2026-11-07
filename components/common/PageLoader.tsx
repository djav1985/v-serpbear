import { type HTMLAttributes, type ReactNode } from 'react';
import Icon from './Icon';

type PageLoaderProps = {
   isLoading: boolean;
   children: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

const PageLoader = ({ isLoading, children, className = '', ...rest }: PageLoaderProps) => (
      <div className={className} {...rest} aria-busy={isLoading}>
         {children}
         {isLoading && (
            <div
               className='fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm'
               role='status'
               aria-live='polite'
               aria-label='Loading content'
               data-testid='page-loader-overlay'
            >
               <Icon type='loading' size={48} />
            </div>
         )}
      </div>
   );

export default PageLoader;
