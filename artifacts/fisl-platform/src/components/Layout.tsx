import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { useGetCurrentMember } from "@workspace/api-client-react";
import { 
  BookOpen, 
  LayoutDashboard, 
  MessageSquare, 
  Settings, 
  LogOut, 
  Shield, 
  CreditCard, 
  Menu
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: member } = useGetCurrentMember();

  // Basic admin check from public metadata (in a real app, from DB/currentMember hook, but we use this for UI hint)
  const isAdmin = member?.role === "admin";

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Pathway", href: "/pathway", icon: BookOpen },
    { name: "Community", href: "/community", icon: MessageSquare },
    { name: "Membership", href: "/membership", icon: CreditCard },
  ];

  const adminNavigation = [
    { name: "Overview", href: "/admin", icon: Shield },
    { name: "Payments", href: "/admin/payments", icon: CreditCard },
    { name: "Content", href: "/admin/content", icon: BookOpen },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background">
      {/* Mobile header */}
      <header className="md:hidden flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="Logo" className="w-8 h-8" />
          <span className="font-serif font-bold text-lg">FISL</span>
        </div>
        <Button variant="ghost" size="icon">
          <Menu className="w-5 h-5" />
        </Button>
      </header>

      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-card h-[100dvh] sticky top-0">
        <div className="p-6 flex items-center gap-3">
          <img src="/logo.svg" alt="Logo" className="w-8 h-8" />
          <span className="font-serif font-bold text-xl tracking-tight">FISL</span>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-4 px-2">
            Learning
          </div>
          {navigation.map((item) => {
            const isActive = location === item.href || location.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </Link>
            );
          })}

          {isAdmin && (
            <>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-8 px-2">
                Administration
              </div>
              {adminNavigation.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                      isActive 
                        ? "bg-primary text-primary-foreground" 
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.name}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-4 px-2">
            <Avatar className="h-9 w-9">
              <AvatarImage src={user?.imageUrl} />
              <AvatarFallback className="bg-primary/10 text-primary">
                {user?.firstName?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium truncate">{user?.fullName || "Member"}</span>
              <span className="text-xs text-muted-foreground truncate">{user?.primaryEmailAddress?.emailAddress}</span>
            </div>
          </div>
          <Button 
            variant="outline" 
            className="w-full justify-start text-muted-foreground"
            onClick={() => signOut({ redirectUrl: "/" })}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
