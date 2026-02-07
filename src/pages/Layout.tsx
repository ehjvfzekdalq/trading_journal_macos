import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Calculator, BookOpen, Upload, Settings, HelpCircle, ChevronLeft, ChevronRight, ListOrdered } from 'lucide-react';
import nemesisLogo from '../assets/nemesis-logo.jpg';
import { Button } from '../components/ui/button';

export default function Layout() {
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  const navigation = [
    { name: t('nav.dashboard'), path: '/dashboard', icon: LayoutDashboard },
    { name: t('nav.calculator'), path: '/calculator', icon: Calculator },
    { name: t('nav.journal'), path: '/journal', icon: BookOpen },
    { name: t('nav.import'), path: '/import', icon: Upload },
    { name: 'Open Orders', path: '/open-orders', icon: ListOrdered },
    { name: t('nav.settings'), path: '/settings', icon: Settings },
    { name: t('nav.help'), path: '/help', icon: HelpCircle },
  ];

  return (
    <div className="flex flex-col md:flex-row h-screen bg-background">
      {/* Mobile Header - visible only on mobile */}
      <header className="md:hidden bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 py-2">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <img
              src={nemesisLogo}
              alt="Nemesis Logo"
              className="w-8 h-8 object-contain rounded-lg"
            />
            <div className="flex flex-col">
              <h1 className="text-sm font-bold text-foreground leading-tight">
                Nemesis
              </h1>
            </div>
          </div>

          {/* Mobile Navigation - Icons only */}
          <nav className="flex items-center gap-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center justify-center p-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                  title={item.name}
                >
                  <Icon className="h-4 w-4" />
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Desktop Sidebar - hidden on mobile, visible on md and up */}
      <aside className={`hidden md:flex bg-card border-r border-border flex-col transition-all duration-300 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}>
        {/* Header */}
        <div className={`p-6 ${isCollapsed ? 'p-4' : ''}`}>
          {!isCollapsed ? (
            <div className="flex items-center gap-3">
              <img
                src={nemesisLogo}
                alt="Nemesis Logo"
                className="w-12 h-12 object-contain rounded-lg flex-shrink-0"
              />
              <div className="flex flex-col">
                <h1 className="text-2xl font-bold text-foreground leading-tight">
                  Nemesis
                </h1>
                <p className="text-sm text-muted-foreground">
                  {i18n.language === 'fr' ? 'Journal de Trading' : 'Trading Journal'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <img
                src={nemesisLogo}
                alt="Nemesis Logo"
                className="w-10 h-10 object-contain rounded-lg"
              />
            </div>
          )}
        </div>

        {/* Navigation */}
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
                } ${isCollapsed ? 'justify-center' : ''}`}
                title={isCollapsed ? item.name : undefined}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {!isCollapsed && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Toggle Button */}
        <div className={`p-3 border-t border-border ${isCollapsed ? 'flex justify-center' : ''}`}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`w-full ${isCollapsed ? 'w-auto' : ''}`}
          >
            {isCollapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <>
                <ChevronLeft className="h-5 w-5 mr-2" />
                <span>{t('common.collapse') || 'Collapse'}</span>
              </>
            )}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
