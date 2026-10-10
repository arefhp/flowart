import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin/AdminShell';
import { RootHtml } from '@/components/site/RootHtml';

// The admin is English only and never indexed. Access signs you in before any admin page is served.
export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootHtml lang="en">
      <AdminShell>{children}</AdminShell>
    </RootHtml>
  );
}
