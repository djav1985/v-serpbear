type DashboardFooterProps = {
   platformName: string;
   version: string;
};

export function DashboardFooter({ platformName, version }: DashboardFooterProps) {
   return (
      <footer className="flex justify-center px-4 pt-2 pb-5">
         <span className="text-muted-foreground text-xs">
            {platformName} v{version} by{' '}
            <a
               className="hover:text-foreground focus-visible:text-foreground underline underline-offset-2 focus-visible:outline-none"
               href="https://vontainment.com"
               rel="noopener noreferrer"
               target="_blank"
            >
               Vontainment
            </a>
         </span>
      </footer>
   );
}
