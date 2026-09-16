'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser, useClerk } from '@clerk/nextjs';
import WorkplaceAccess from '@/components/WorkplaceAccess';
import {
  Inbox,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
  User,
  Shield,
  Activity,
  MessageSquare,
  Sun,
  Moon,
} from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
  badgeVariant?: 'default' | 'warning' | 'critical';
}

const navItems: NavItem[] = [
  { href: '/dashboard/drafts', label: 'Draft Queue', icon: Inbox },
  { href: '/dashboard/chat', label: 'AI Assistant', icon: MessageSquare },
  { href: '/dashboard/tickets', label: 'Tickets', icon: FileText },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

function DashboardLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const {user} = useUser();
  const {signOut} = useClerk();
  const session = user ? {user:{name:user.fullName,image:user.imageUrl,email:user.primaryEmailAddress?.emailAddress}} : null;
  const { theme, toggleTheme, mounted } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const getBadgeClass = (variant?: string) => {
    switch (variant) {
      case 'critical':
        return 'badge-critical';
      case 'warning':
        return 'badge-pending';
      default:
        return 'bg-primary/20 text-primary';
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar - Command Center Style */}
      <aside
        className={`fixed left-0 top-0 h-full bg-card-elevated border-r border-border/50 transition-all duration-300 z-40 ${
          sidebarCollapsed ? 'w-16' : 'w-72'
        }`}
      >
        {/* Logo Section */}
        <div className={`h-16 flex items-center border-b border-border/50 ${sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
          {!sidebarCollapsed && (
            <Link href="/dashboard/drafts" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/25">
                  <Shield className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success border-2 border-card-elevated animate-pulse" />
              </div>
              <div>
                <span className="font-bold text-lg text-foreground tracking-tight">ITSS</span>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Command Center</p>
              </div>
            </Link>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`rounded-lg hover:bg-muted/50 transition-all duration-200 hover:scale-105 ${sidebarCollapsed ? 'p-2.5' : 'p-2'}`}
          >
            {sidebarCollapsed ? (
              <Menu className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronLeft className="h-5 w-5 text-muted-foreground" />
            )}
          </button>
        </div>

        {/* System Status */}
        {!sidebarCollapsed && (
          <div className="mx-3 mt-4 p-3 rounded-lg bg-success/5 border border-success/20">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-success" />
              <span className="text-xs font-medium text-success">Support workspace</span>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className={`mt-2 space-y-1 ${sidebarCollapsed ? 'px-2' : 'p-3'}`}>
          {!sidebarCollapsed && (
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground px-3 mb-2">Operations</p>
          )}
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={sidebarCollapsed ? item.label : undefined}
                className={`nav-item group flex items-center rounded-lg transition-all duration-200 ${
                  sidebarCollapsed
                    ? 'justify-center p-2.5'
                    : 'gap-3 px-3 py-2.5'
                } ${
                  isActive
                    ? 'nav-item-active bg-primary/10 text-primary border border-primary/20 shadow-sm shadow-primary/10'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent'
                }`}
              >
                <div className={`rounded-md ${sidebarCollapsed ? 'p-2' : 'p-1.5'} ${isActive ? 'bg-primary/20' : 'bg-muted/50 group-hover:bg-muted'}`}>
                  <Icon className={`flex-shrink-0 ${sidebarCollapsed ? 'h-5 w-5' : 'h-4 w-4'}`} />
                </div>
                {!sidebarCollapsed && (
                  <span className="font-medium text-sm">{item.label}</span>
                )}
                {!sidebarCollapsed && item.badge !== undefined && (
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-semibold ${getBadgeClass(item.badgeVariant)}`}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Section - Premium Style */}
        <div className={`absolute bottom-0 left-0 right-0 border-t border-border/50 bg-gradient-to-t from-card-elevated to-transparent ${sidebarCollapsed ? 'p-2' : 'p-3'}`}>
          {/* Theme Toggle */}
          {mounted && (
            <div className={`mb-3 ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
              <button
                onClick={toggleTheme}
                className={`flex items-center gap-2 rounded-lg transition-all duration-200 hover:bg-muted/50 ${
                  sidebarCollapsed ? 'p-2.5' : 'w-full px-3 py-2.5'
                }`}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                <div className={`rounded-md ${sidebarCollapsed ? 'p-0' : 'p-1.5'} bg-muted/50`}>
                  {theme === 'dark' ? (
                    <Sun className={`text-amber-400 ${sidebarCollapsed ? 'h-5 w-5' : 'h-4 w-4'}`} />
                  ) : (
                    <Moon className={`text-slate-600 ${sidebarCollapsed ? 'h-5 w-5' : 'h-4 w-4'}`} />
                  )}
                </div>
                {!sidebarCollapsed && (
                  <span className="text-sm font-medium text-muted-foreground">
                    {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                  </span>
                )}
              </button>
            </div>
          )}
          {session?.user ? (
            <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
              <div className="relative" title={sidebarCollapsed ? session.user.name || 'User' : undefined}>
                <div className={`rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center ring-2 ring-primary/20 overflow-hidden ${sidebarCollapsed ? 'h-10 w-10' : 'h-10 w-10'}`}>
                  {session.user.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={session.user.image}
                      alt={session.user.name || 'User'}
                      className="h-full w-full rounded-xl object-cover"
                    />
                  ) : (
                    <User className="h-5 w-5 text-primary" />
                  )}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success border-2 border-card-elevated" />
              </div>
              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {session.user.name || 'Agent'}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {session.user.email}
                  </p>
                </div>
              )}
              {!sidebarCollapsed && (
                <button
                  onClick={() => signOut({ redirectUrl: 'https://www.digitalworkplace.ai/sign-in' })}
                  className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all duration-200"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : (
            <Link
              href="https://www.digitalworkplace.ai/sign-in"
              className={`btn-primary flex items-center justify-center rounded-lg font-medium transition-all duration-200 ${sidebarCollapsed ? 'p-2.5' : 'gap-2 px-4 py-2.5'}`}
            >
              <User className="h-5 w-5" />
              {!sidebarCollapsed && <span>Sign In</span>}
            </Link>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={`flex-1 transition-all duration-300 ${
          sidebarCollapsed ? 'ml-16' : 'ml-72'
        }`}
      >
        {children}
      </main>
    </div>
  );
}

export default function DashboardLayout({children}: {children: React.ReactNode}) { return <WorkplaceAccess><DashboardLayoutContent>{children}</DashboardLayoutContent></WorkplaceAccess>; }
