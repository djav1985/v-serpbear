import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
   title: 'Page not found',
};

export default function GlobalNotFound() {
   return (
      <html lang="en">
         <body>
            <main className="bg-muted/40 text-foreground flex min-h-screen items-center justify-center p-4">
               <div className="text-center">
                  <h1 className="text-2xl font-semibold">Page not found</h1>
                  <p className="text-muted-foreground mt-2 text-sm">The page you’re looking for could not be found.</p>
               </div>
            </main>
         </body>
      </html>
   );
}
