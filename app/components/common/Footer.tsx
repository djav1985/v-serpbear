interface FooterProps {
   currentVersion: string
}

const Footer = ({ currentVersion = '' }: FooterProps) => (
      <footer className='text-center flex flex-1 justify-center pb-5 items-end'>
         <span className='text-gray-500 text-xs'>SerpBear v{currentVersion || '0.0.0'}</span>
      </footer>
   );

export default Footer;
