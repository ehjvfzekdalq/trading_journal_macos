import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Calculator, BookOpen, Upload, Settings } from 'lucide-react';

export default function Layout() {
  const location = useLocation();
  const { t, i18n } = useTranslation();

  const navigation = [
    { name: t('nav.dashboard') || 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: t('nav.calculator') || 'Calculator', path: '/calculator', icon: Calculator },
    { name: t('nav.journal') || 'Journal', path: '/journal', icon: BookOpen },
    { name: t('nav.import') || 'Import', path: '/import', icon: Upload },
    { name: t('nav.settings') || 'Settings', path: '/settings', icon: Settings },
  ];

  const switchLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-foreground leading-tight">
            Nemesis<br />Trading Journal
          </h1>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Language Switcher */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <button
              onClick={() => switchLanguage('en')}
              className={`flex-1 px-3 py-2 rounded text-sm ${
                i18n.language === 'en'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-accent text-accent-foreground'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => switchLanguage('fr')}
              className={`flex-1 px-3 py-2 rounded text-sm ${
                i18n.language === 'fr'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-accent text-accent-foreground'
              }`}
            >
              FR
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
