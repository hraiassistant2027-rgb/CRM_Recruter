import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'KAN Talent', template: '%s · KAN Talent' },
  description: 'Система рекрутингу',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
