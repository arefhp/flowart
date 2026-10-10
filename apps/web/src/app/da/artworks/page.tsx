import { ArtworksScreen, artworksMetadata } from '@/screens/artworks';

export const generateMetadata = () => artworksMetadata('da');
export default function Page() {
  return <ArtworksScreen locale="da" />;
}
