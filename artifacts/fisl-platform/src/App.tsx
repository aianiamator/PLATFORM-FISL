import { useEffect, useRef, type ReactNode } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { QueryClient } from "@tanstack/react-query";
import { getGetCurrentMemberQueryKey, useGetCurrentMember } from "@workspace/api-client-react";

import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Pathway from "@/pages/Pathway";
import Lesson from "@/pages/Lesson";
import Community from "@/pages/Community";
import Membership from "@/pages/Membership";
import AdminOverview from "@/pages/AdminOverview";
import AdminPayments from "@/pages/AdminPayments";
import AdminContent from "@/pages/AdminContent";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/Layout";

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(224, 40%, 10%)",
    colorForeground: "hsl(224, 40%, 10%)",
    colorMutedForeground: "hsl(224, 15%, 40%)",
    colorDanger: "hsl(0, 84%, 60%)",
    colorBackground: "hsl(0, 0%, 100%)",
    colorInput: "transparent",
    colorInputForeground: "hsl(224, 40%, 10%)",
    colorNeutral: "hsl(224, 15%, 90%)",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-card rounded-2xl w-[440px] max-w-full overflow-hidden border border-border shadow-md",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none border-t border-border",
    headerTitle: "text-2xl font-bold tracking-tight text-foreground",
    headerSubtitle: "text-sm text-muted-foreground",
    socialButtonsBlockButtonText: "text-sm font-medium",
    formFieldLabel: "text-sm font-medium text-foreground",
    footerActionLink: "text-primary font-medium hover:underline",
    footerActionText: "text-sm text-muted-foreground",
    dividerText: "text-xs text-muted-foreground",
    identityPreviewEditButton: "text-primary hover:underline",
    formFieldSuccessText: "text-sm text-green-600",
    alertText: "text-sm text-destructive",
    logoBox: "h-12 flex items-center justify-center mb-4",
    logoImage: "h-10 object-contain",
    socialButtonsBlockButton: "border border-input hover:bg-accent hover:text-accent-foreground",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90",
    formFieldInput: "border border-input rounded-md px-3 py-2 text-sm focus-visible:ring-1 focus-visible:ring-ring",
    footerAction: "bg-muted/50 p-6 flex flex-col gap-2 items-center",
    dividerLine: "bg-border",
    alert: "border border-destructive/20 bg-destructive/10 text-destructive",
    otpCodeFieldInput: "border border-input rounded-md",
    formFieldRow: "space-y-4",
    main: "p-8",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

// Protected route wrapper
const AppRoute = ({ component: Component, path }: { component: any, path: string }) => {
  return (
    <Route path={path}>
      {params => (
        <Show when="signed-in" fallback={<Redirect to="/" />}>
          <Layout>
            <Component params={params} />
          </Layout>
        </Show>
      )}
    </Route>
  );
};

function AdminGuard({ children }: { children: ReactNode }) {
  const { data: member, isLoading } = useGetCurrentMember({
    query: { queryKey: getGetCurrentMemberQueryKey() },
  });
  const [, setLocation] = useLocation();
  const unauthorized = !isLoading && member?.role !== "admin";

  useEffect(() => {
    if (unauthorized) setLocation("/dashboard", { replace: true });
  }, [setLocation, unauthorized]);

  if (isLoading) return <Layout><div className="py-16 text-center text-muted-foreground">Checking access…</div></Layout>;
  if (unauthorized) return <Layout><div className="py-16 text-center text-muted-foreground">Redirecting…</div></Layout>;
  return <Layout>{children}</Layout>;
}

const AdminRoute = ({ component: Component, path }: { component: any, path: string }) => (
  <Route path={path}>
    {params => (
      <Show when="signed-in" fallback={<Redirect to="/" />}>
        <AdminGuard>
          <Component params={params} />
        </AdminGuard>
      </Show>
    )}
  </Route>
);

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to access your account",
          },
        },
        signUp: {
          start: {
            title: "Join the community",
            subtitle: "Create your account to get started",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            
            <AppRoute path="/dashboard" component={Dashboard} />
            <AppRoute path="/pathway" component={Pathway} />
            <AppRoute path="/lessons/:lessonId" component={Lesson} />
            <AppRoute path="/community" component={Community} />
            <AppRoute path="/membership" component={Membership} />
            
            {/* Admin routes */}
            <AdminRoute path="/admin" component={AdminOverview} />
            <AdminRoute path="/admin/payments" component={AdminPayments} />
            <AdminRoute path="/admin/content" component={AdminContent} />
            
            <Route>
              <Layout>
                <NotFound />
              </Layout>
            </Route>
          </Switch>
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ErrorBoundary resetKey={window.location.pathname}>
        <ClerkProviderWithRoutes />
        <Toaster />
      </ErrorBoundary>
    </WouterRouter>
  );
}

export default App;
