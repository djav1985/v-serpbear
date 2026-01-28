import { useBranding } from '../../hooks/useBranding';

interface FooterProps {
   currentVersion: string
}

const Footer = ({ currentVersion = '' }: FooterProps) => {
   const { branding } = useBranding();
   const { platformName } = branding;

   return (
      <footer className='text-center flex flex-1 justify-center pb-5 items-end'>
         <span className='text-gray-500 text-xs'>
            {platformName} v{currentVersion || '4.0.0'} by{' '}
            <a
               className='text-gray-500 underline underline-offset-2 hover:text-gray-400 focus:text-gray-400 focus:outline-none'
               href='https://vontainment.com'
               rel='noopener noreferrer'
               target='_blank'
            >
               Vontainment
            </a>
         </span>
      </footer>
   );
};

export default Footer;
