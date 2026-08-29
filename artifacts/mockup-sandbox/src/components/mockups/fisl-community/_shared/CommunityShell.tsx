import { useState, type ReactNode } from "react";
import { Bell, BookOpen, ChevronDown, CircleHelp, Compass, LayoutDashboard, Library, LogOut, Search, Settings, Sparkles, Users, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import "../_group.css";

type ShellProps = {
  role: "member" | "admin";
  active: string;
  children: ReactNode;
  onNavigate?: (item: string) => void;
};

const memberNav = [
  { label: "Home", icon: LayoutDashboard },
  { label: "Learn", icon: BookOpen },
  { label: "Explore", icon: Compass },
];

const adminNav = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Content", icon: Library },
  { label: "Members", icon: Users },
];

export function CommunityShell({ role, active, children, onNavigate }: ShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const nav = role === "member" ? memberNav : adminNav;
  const initials = role === "member" ? "AK" : "JM";
  const name = role === "member" ? "Ari Kim" : "Jordan Miles";

  const handleNav = (label: string) => {
    onNavigate?.(label);
    setMobileOpen(false);
  };

  return (
    <div className="fisl-frame fisl-paper-grain min-h-[100dvh]">
      <aside className="fisl-sidebar fixed inset-y-0 left-0 z-30 hidden w-[236px] flex-col px-5 py-6 lg:flex">
        <div className="mb-12 flex items-center gap-3 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--fisl-lime))] text-[hsl(var(--fisl-ink))]">
            <Sparkles size={18} strokeWidth={2.5} />
          </div>
          <div>
            <div className="fisl-display text-xl font-bold tracking-[-.08em]">FISL</div>
            <div className="fisl-mono text-[8px] uppercase tracking-[.22em] text-[hsl(var(--fisl-paper)/.55)]">Private learning room</div>
          </div>
        </div>
        <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.22em] text-[hsl(var(--fisl-paper)/.4)]">
          {role === "member" ? "Your room" : "Control room"}
        </div>
        <nav className="space-y-1.5">
          {nav.map(({ label, icon: Icon }) => (
            <button key={label} type="button" data-active={active === label} onClick={() => handleNav(label)} className="fisl-sidebar-button flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold">
              <Icon size={17} strokeWidth={1.8} />
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-1.5">
          <button type="button" onClick={() => handleNav("Help")} className="fisl-sidebar-button flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[hsl(var(--fisl-paper)/.68)]"><CircleHelp size={17} /> Help centre</button>
          <button type="button" onClick={() => handleNav("Settings")} className="fisl-sidebar-button flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[hsl(var(--fisl-paper)/.68)]"><Settings size={17} /> Settings</button>
          <div className="mt-5 border-t border-[hsl(var(--fisl-paper)/.12)] pt-4">
            <div className="flex items-center gap-3 px-2">
              <Avatar className="h-9 w-9 border border-[hsl(var(--fisl-paper)/.18)]">
                <AvatarFallback className="bg-[hsl(var(--fisl-coral))] text-xs font-bold text-[hsl(var(--fisl-ink))]">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{name}</div>
                <div className="text-[11px] text-[hsl(var(--fisl-paper)/.5)]">{role === "member" ? "Member since May 2024" : "Workspace owner"}</div>
              </div>
              <button type="button" onClick={() => handleNav("Account")} aria-label="Open account menu"><ChevronDown size={15} className="text-[hsl(var(--fisl-paper)/.5)]" /></button>
            </div>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[hsl(var(--fisl-ink)/.09)] bg-[hsl(var(--fisl-paper)/.9)] px-5 backdrop-blur-md lg:ml-[236px] lg:px-10">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setMobileOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg border border-[hsl(var(--fisl-ink)/.14)] lg:hidden" aria-label="Open menu"><LayoutDashboard size={17} /></button>
          <div className="flex items-center gap-2 lg:hidden"><Sparkles size={16} /><span className="fisl-display font-bold tracking-[-.06em]">FISL</span></div>
          <div className="relative hidden w-[240px] md:block">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--fisl-ink)/.42)]" />
            <input className="fisl-input h-10 w-full rounded-lg border border-[hsl(var(--fisl-ink)/.12)] bg-transparent pl-9 pr-3 text-sm placeholder:text-[hsl(var(--fisl-ink)/.4)]" placeholder="Search lessons, people..." aria-label="Search lessons and people" />
          </div>
        </div>
        <div className="relative flex items-center gap-3">
          <button type="button" onClick={() => setNotificationsOpen(!notificationsOpen)} className="relative grid h-9 w-9 place-items-center rounded-lg text-[hsl(var(--fisl-ink)/.65)] hover:bg-[hsl(var(--fisl-ink)/.06)]" aria-label="Notifications">
            <Bell size={18} />
            <span className="fisl-pulse-dot absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[hsl(var(--fisl-coral))]" />
          </button>
          {notificationsOpen && <div className="absolute right-0 top-12 w-72 rounded-xl border border-[hsl(var(--fisl-ink)/.12)] bg-[hsl(var(--fisl-paper))] p-4 shadow-xl"><div className="mb-3 flex items-center justify-between"><b className="text-sm">Notifications</b><button type="button" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications"><X size={14} /></button></div><div className="rounded-lg bg-[hsl(var(--fisl-aqua)/.28)] p-3 text-xs leading-relaxed"><b>Mina replied to your thread</b><br /><span className="text-[hsl(var(--fisl-ink)/.6)]">“The eval checklist is gold.” · 18m</span></div></div>}
          <div className="hidden h-7 w-px bg-[hsl(var(--fisl-ink)/.12)] sm:block" />
          <div className="hidden text-right sm:block"><div className="text-sm font-bold">{name}</div><div className="text-[10px] uppercase tracking-[.14em] text-[hsl(var(--fisl-ink)/.5)]">{role === "member" ? "Active member" : "FISL admin"}</div></div>
          <Avatar className="h-9 w-9"><AvatarFallback className="bg-[hsl(var(--fisl-coral))] text-xs font-bold text-[hsl(var(--fisl-ink))]">{initials}</AvatarFallback></Avatar>
        </div>
      </header>

      {mobileOpen && <div className="fixed inset-0 z-40 bg-[hsl(var(--fisl-ink)/.42)] lg:hidden" onClick={() => setMobileOpen(false)}>
        <aside className="fisl-sidebar h-full w-[270px] px-5 py-6" onClick={(event) => event.stopPropagation()}>
          <div className="mb-10 flex items-center justify-between"><div className="flex items-center gap-2"><Sparkles size={18} className="text-[hsl(var(--fisl-lime))]" /><span className="fisl-display text-xl font-bold">FISL</span></div><button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
          <nav className="space-y-1.5">{nav.map(({ label, icon: Icon }) => <button key={label} type="button" data-active={active === label} onClick={() => handleNav(label)} className="fisl-sidebar-button flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold"><Icon size={17} />{label}</button>)}</nav>
          <div className="mt-8 border-t border-[hsl(var(--fisl-paper)/.12)] pt-5"><button type="button" onClick={() => handleNav("Help")} className="fisl-sidebar-button flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm"><LogOut size={17} /> Sign out</button></div>
        </aside>
      </div>}

      <main className="lg:ml-[236px]">{children}</main>
    </div>
  );
}