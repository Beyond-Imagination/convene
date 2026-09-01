import './globals.css';

import type { Metadata } from 'next';
import { IBM_Plex_Mono, Manrope } from 'next/font/google';

const sans = Manrope({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Convene',
  description: 'WebRTC meetings + chat + structured meeting reports.',
  icons: { icon: '/logo.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      className={`${sans.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
