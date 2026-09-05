import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/lib/providers';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Apex Research - Web Analysis Reports',
  description: 'Retrieve search-result snippets, review heuristic sentiment counts, and export PowerPoint reports.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen flex flex-col antialiased">
        <Providers>
          <Navbar />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
