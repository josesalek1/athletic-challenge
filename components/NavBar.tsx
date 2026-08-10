'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/hoy',      icon: '◉', label: 'Today' },
  { href: '/semana',   icon: '▤', label: 'Progress' },
  { href: '/training', icon: '≋', label: 'Training' },
  { href: '/settings', icon: '•••', label: 'More' },
];

export default function NavBar() {
  const path = usePathname();
  return (
    <nav className="tabs">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className="tab" data-active={path.startsWith(t.href)}>
          <span aria-hidden>{t.icon}</span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
