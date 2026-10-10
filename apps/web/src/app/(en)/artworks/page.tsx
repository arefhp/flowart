import { ArtworksScreen, artworksMetadata } from '@/screens/artworks';

export const generateMetadata = () => artworksMetadata('en');
export default function Page() {
  return <ArtworksScreen locale="en" />;
}
