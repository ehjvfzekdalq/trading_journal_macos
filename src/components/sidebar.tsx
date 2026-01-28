'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  Calculator,
  BookOpen,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '', key: 'dashboard', icon: LayoutDashboard },
  { href: '/calculator', key: 'calculator', icon: Calculator },
  { href: '/journal', key: 'journal', icon: BookOpen },
  { href: '/settings', key: 'settings', icon: Settings },
];

export function Sidebar({ locale }: { locale: string }) {
  const pathname = usePathname();
  const t = useTranslations('nav');

  // Get the path without locale for language switching
  const pathWithoutLocale = pathname.replace(/^\/(en|fr)/, '') || '';

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-card">
      {/* Header */}
      <div className="flex h-16 items-center border-b px-6">
        <div>
          <h1 className="text-base font-semibold">Nemesis</h1>
          <p className="text-xs text-muted-foreground">Trading Tracker</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 p-3">
        {navItems.map((item) => {
          const href = `/${locale}${item.href}`;
          const isActive = pathname === href || (item.href !== '' && pathname.startsWith(href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {t(item.key)}
            </Link>
          );
        })}
      </nav>

      {/* Language Switcher */}
      <div className="absolute bottom-4 left-3 right-3">
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
          <Link
            href={`/en${pathWithoutLocale}`}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-center text-xs font-medium transition-colors',
              locale === 'en'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            EN
          </Link>
          <Link
            href={`/fr${pathWithoutLocale}`}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-center text-xs font-medium transition-colors',
              locale === 'fr'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            FR
          </Link>
        </div>
      </div>
    </aside>
  );
}
