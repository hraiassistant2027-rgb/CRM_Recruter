import type { Metadata } from 'next';
import { Fira_Sans } from 'next/font/google';
import './globals.css';

// Шрифт інтерфейсу (як у зразку дизайну), з кирилицею
const fira = Fira_Sans({ subsets: ['latin', 'cyrillic'], weight: ['400', '500', '600', '700'], variable: '--font-fira', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'KAN Talent', template: '%s · KAN Talent' },
  description: 'Система рекрутингу',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" className={fira.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
