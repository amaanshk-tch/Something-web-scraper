import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/lib/providers';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Apex Research',
  description: 'Research review and source analysis workspace.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Navbar />
          <main className="mx-auto w-full max-w-[1380px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
