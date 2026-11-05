import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'Marketing Workspace',
  description: 'Turn your products into ready-to-publish marketing campaigns.',
  // All current routes are private workspace or auth pages (see robots.ts).
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading request headers renders every page per request, which the nonce-based
  // Content-Security-Policy set in middleware.ts requires.
  await headers();
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
