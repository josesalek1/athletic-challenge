import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Athletic Challenge',
  description: 'Daily challenges, private training and shared group consistency.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black', title: 'Athletic Challenge' },
};

export const viewport: Viewport = {
  themeColor: '#0A2A33',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
