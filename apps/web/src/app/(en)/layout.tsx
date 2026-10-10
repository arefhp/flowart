import { RootHtml } from '@/components/site/RootHtml';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RootHtml lang="en">{children}</RootHtml>;
}
