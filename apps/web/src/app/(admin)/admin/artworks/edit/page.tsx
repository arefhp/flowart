import { Suspense } from 'react';
import { EditArtwork } from '@/components/admin/ArtworksAdmin';

// Detail pages use a query parameter (?id=...), not a dynamic route (spec section 1.2).
export default function Page() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <EditArtwork />
    </Suspense>
  );
}
