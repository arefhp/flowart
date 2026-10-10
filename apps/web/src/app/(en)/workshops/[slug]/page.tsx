import { getEventSlugs } from '@/lib/api';
import { EventScreen, eventMetadata } from '@/screens/events';

type Props = { params: Promise<{ slug: string }> };

// Every public workshop (upcoming, finished or cancelled) gets a static page at build time.
export async function generateStaticParams() {
  return (await getEventSlugs()).map((slug) => ({ slug }));
}
export async function generateMetadata({ params }: Props) {
  return eventMetadata('en', (await params).slug);
}
export default async function Page({ params }: Props) {
  return <EventScreen locale="en" slug={(await params).slug} />;
}
