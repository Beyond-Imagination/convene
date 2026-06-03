import './globals.css';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Convene',
  description: 'WebRTC meetings + chat + structured meeting reports.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
