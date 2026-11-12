'use client';

import './globals.css';

type GlobalErrorProps = {
   error: unknown;
   retry: () => void;
};

export default function GlobalError(_props: GlobalErrorProps) {
   return (
      <html lang="en">
         <head>
            <title>Something went wrong</title>
         </head>
         <body>
            <main className="bg-muted/40 text-foreground flex min-h-screen items-center justify-center p-4">
               <div className="text-center">
                  <h1 className="text-2xl font-semibold">Something went wrong</h1>
                  <p className="text-muted-foreground mt-2 text-sm">Please try again later.</p>
               </div>
            </main>
         </body>
      </html>
   );
}
