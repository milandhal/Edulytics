import { useState } from 'react';
import { Outlet, NavLink, Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { InitialsAvatar } from './InitialsAvatar';
import { BrandText } from './BrandText';

interface NavItemProps {
  to: string;
  icon: string;
  label: string;
  collapsed: boolean;
  filled?: boolean;
}

function NavItem({ to, icon, label, collapsed, filled }: NavItemProps) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl text-sm font-medium transition-all ${
          collapsed ? 'mx-auto h-10 w-10 justify-center px-0 py-3' : 'px-4 py-2.5'
        } ${
          isActive
            ? 'bg-primary/10 font-semibold text-primary'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
        }`
      }
    >
      <span
        className="material-symbols-outlined flex-shrink-0"
        style={{
          fontSize: 20,
          fontVariationSettings: filled ? "'FILL' 1" : "'FILL' 0",
        }}
      >
        {icon}
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

function BrandMark({}: { role: 'FACULTY' | 'ADMIN' }) {
  return (
    <Link to="/dashboard" className="flex min-w-0 items-center gap-3">
      <div className="hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary shadow-sm shadow-primary/20">
        <span
          className="material-symbols-outlined text-base text-white"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          school
        </span>
      </div>
      <div className="min-w-0">
        <div className="leading-none">
          <BrandText className="text-xl" />
        </div>
        <p className="mt-0.5 truncate text-[9px] font-semibold uppercase tracking-widest text-slate-400">
          
        </p>
      </div>
    </Link>
  );
}

export function Layout() {
  const { user, logout, isAdmin, isLoading } = useAuth();
  const [pinned, setPinned] = useState(true);
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-500 shadow-sm">
          <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
          Loading session
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login-selection" replace />;
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  const role = user.role === 'FACULTY' ? 'FACULTY' : 'ADMIN';
  const roleLabel =
    user.role === 'SUPER_ADMIN' ? 'Super Admin' : user.role === 'ADMIN' ? 'Admin' : 'Faculty';

  return (
    <div className="flex h-screen print:h-auto overflow-hidden print:overflow-visible print:bg-white" style={{ background: '#f8fafc' }}>
      <div className="pointer-events-none fixed -left-24 -top-24 z-0 h-[500px] w-[500px] rounded-full bg-primary opacity-[0.04] blur-[120px] print:hidden" />
      <div className="pointer-events-none fixed -bottom-24 -right-24 z-0 h-[600px] w-[600px] rounded-full bg-secondary opacity-[0.04] blur-[120px] print:hidden" />

      <aside
        className={`relative z-40 flex h-full flex-shrink-0 flex-col border-r border-slate-100 bg-white/60 shadow-sm backdrop-blur-2xl transition-all duration-300 print:hidden ${
          pinned ? 'w-60' : 'w-[60px]'
        }`}
      >
        <div className={`py-5 ${pinned ? 'px-3' : 'px-2'}`}>
          <button
            onClick={() => setPinned((current) => !current)}
            title={pinned ? 'Collapse sidebar' : 'Pin sidebar'}
            className={`flex items-center rounded-xl text-slate-300 transition-all hover:bg-slate-100 hover:text-slate-500 ${
              pinned ? 'h-10 w-full px-4 py-2.5' : 'mx-auto h-10 w-10 justify-center px-0 py-3'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {pinned ? 'left_panel_close' : 'left_panel_open'}
            </span>
          </button>
        </div>

        <nav className={`flex-1 space-y-0.5 overflow-y-auto ${pinned ? 'px-3' : 'px-2'}`}>
          <NavItem to="/dashboard" icon="dashboard" label="Dashboard" collapsed={!pinned} filled />
          {isAdmin && (
            <NavItem to="/faculty-assignment" icon="manage_accounts" label="Faculty Assignment" collapsed={!pinned} />
          )}
          {!isAdmin ? <NavItem to="/analytics" icon="analytics" label="Analytics" collapsed={!pinned} /> : null}

          {isAdmin ? (
            <NavItem to="/admin/offerings" icon="menu_book" label="Offering" collapsed={!pinned} />
          ) : (
            <NavItem to="/offerings" icon="auto_stories" label="My Offerings" collapsed={!pinned} />
          )}

          {isAdmin && (
            <>
              <NavItem to="/students" icon="group" label="Students" collapsed={!pinned} filled />
              <NavItem to="/admin/subjects" icon="book_2" label="Subjects" collapsed={!pinned} />
              <NavItem to="/admin/users" icon="badge" label="Users" collapsed={!pinned} />
              <NavItem to="/admin/programs" icon="category" label="Programs" collapsed={!pinned} />
              <NavItem to="/admin/upload" icon="upload_file" label="Bulk Upload" collapsed={!pinned} />
            </>
          )}
        </nav>

        <div className={`space-y-0.5 border-t border-slate-100 pt-4 pb-5 ${pinned ? 'px-3' : 'px-2'}`}>
          {isAdmin ? (
            <NavItem to="/settings" icon="settings" label="Settings" collapsed={!pinned} />
          ) : null}
          <button
            onClick={() => {
              void logout();
            }}
            title="Logout"
            className={`w-full items-center rounded-xl text-xs text-red-400/70 transition-colors hover:bg-red-50/50 hover:text-red-500 ${
              pinned ? 'flex gap-3 px-4 py-2.5' : 'mx-auto flex h-10 w-10 justify-center py-3'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            {pinned && 'Logout'}
          </button>
        </div>
      </aside>

      <div className="relative z-10 flex flex-1 flex-col overflow-hidden print:overflow-visible">
        <header className="flex h-[60px] flex-shrink-0 items-center justify-between border-b border-slate-100 bg-white/60 px-6 backdrop-blur-md print:hidden">
          <div className="min-w-0">
            <BrandMark role={role} />
          </div>

          <div className="flex items-center gap-4">
            <button className="relative rounded-full p-2 text-slate-400 transition-all hover:bg-slate-50">
              <span className="material-symbols-outlined text-[20px]">notifications</span>
              <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-red-500" />
            </button>
            <div className="h-5 w-px bg-slate-100" />
            <div className="flex items-center gap-2.5">
              <div className="hidden text-right sm:block">
                <p className="text-xs font-bold leading-none text-slate-800">{user.name}</p>
                <p className="mt-0.5 text-[9px] uppercase tracking-widest text-slate-400">
                  {roleLabel}
                </p>
              </div>
              <InitialsAvatar name={user.name} size="sm" />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto print:overflow-visible">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
