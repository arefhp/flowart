import { RootHtml } from '@/components/site/RootHtml';

/** Served as 404.html for any unknown address, so it speaks both languages. */
export default function NotFound() {
  return (
    <RootHtml lang="en">
      <main className="mx-auto max-w-xl px-6 py-24">
        <h1 className="text-4xl">Page not found</h1>
        <p className="mt-4 text-stone">We cannot find that page. It may have been moved or removed.</p>
        <p className="mt-2">
          <a className="link" href="/">Go to the home page</a>
        </p>
        <h2 className="mt-16 text-3xl" lang="da">Siden findes ikke</h2>
        <p className="mt-4 text-stone" lang="da">Vi kan ikke finde siden. Den kan være flyttet eller fjernet.</p>
        <p className="mt-2" lang="da">
          <a className="link" href="/da">Gå til forsiden</a>
        </p>
      </main>
    </RootHtml>
  );
}
