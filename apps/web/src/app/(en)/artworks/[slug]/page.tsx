import { getArtworkSlugs } from '@/lib/api';
import { ArtworkScreen, artworkMetadata } from '@/screens/artworks';

type Props = { params: Promise<{ slug: string }> };

// Every published artwork gets a static page at build time (spec 1.2).
export async function generateStaticParams() {
  return (await getArtworkSlugs()).map((slug) => ({ slug }));
}
export async function generateMetadata({ params }: Props) {
  return artworkMetadata('en', (await params).slug);
}
export default async function Page({ params }: Props) {
  return <ArtworkScreen locale="en" slug={(await params).slug} />;
}
