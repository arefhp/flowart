import { Suspense } from 'react';
import { EditEvent } from '@/components/admin/EventsAdmin';

// Detail pages use a query parameter (?id=...), not a dynamic route (spec section 1.2).
export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <EditEvent />
    </Suspense>
  );
}
