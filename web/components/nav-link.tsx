import Link from 'next/link';
import type { ComponentProps } from 'react';

// Посилання, яке може перемикати простір (/api/workspace): звичайний перехід без попереднього
// завантаження — інакше браузер «заздалегідь» відкриває посилання і мовчки перемикає простір.
export function NavLink({ href, ...props }: Omit<ComponentProps<'a'>, 'href'> & { href: string }) {
  if (href.startsWith('/api/workspace')) return <a href={href} {...props} />;
  return <Link href={href} {...props} />;
}
