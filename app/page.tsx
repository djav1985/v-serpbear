import { redirect } from 'next/navigation';

/** The app has no home page of its own: signed-in visitors land on Domains, and Domains sends signed-out ones to login. */
export default function HomePage() {
   redirect('/domains');
}
