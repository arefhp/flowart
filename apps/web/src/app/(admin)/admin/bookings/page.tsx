import { Suspense } from 'react';
import { BookingsAdmin } from '@/components/admin/BookingsAdmin';

// Filters live in the query string (?event=...), so this reads the address in the browser.
export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <BookingsAdmin />
    </Suspense>
  );
}
