import { useLocation, Switch, Route, Router as WouterRouter } from 'wouter';
import { ClerkProvider, SignIn, SignUp } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { dark } from '@clerk/themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { AuthGate } from './components/AuthGate';
import { AdminPanel } from './components/admin/AdminPanel';
import { DepositPage } from './components/deposit/DepositPage';

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// Empty in dev (intentional) — auto-set in prod. Do NOT gate on NODE_ENV.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  theme: dark,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#e0221c',
    colorForeground: '#f1f5f9',
    colorMutedForeground: '#94a3b8',
    colorDanger: '#ef4444',
    colorBackground: '#1e1e24',
    colorInput: '#2b2b35',
    colorInputForeground: '#f1f5f9',
    colorNeutral: '#475569',
    fontFamily: "'Outfit', sans-serif",
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#1e1e24] rounded-2xl w-[440px] max-w-full overflow-hidden border border-white/10 shadow-2xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-white font-black',
    headerSubtitle: 'text-slate-400',
    socialButtonsBlockButtonText: 'text-white',
    formFieldLabel: 'text-slate-300',
    footerActionLink: 'text-red-400 hover:text-red-300',
    footerActionText: 'text-slate-400',
    dividerText: 'text-slate-500',
    identityPreviewEditButton: 'text-red-400',
    formFieldSuccessText: 'text-green-400',
    alertText: 'text-white',
    logoBox: 'mb-1',
    logoImage: 'h-10 w-10',
    socialButtonsBlockButton: 'border-white/20 hover:bg-white/10 text-white',
    formButtonPrimary: 'bg-red-600 hover:bg-red-700 text-white font-bold',
    formFieldInput: 'bg-white/10 border-white/20 text-white',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-white/20',
    alert: 'border-red-500/30 bg-red-500/10',
    otpCodeFieldInput: 'bg-white/10 border-white/20 text-white',
    formFieldRow: '',
    main: '',
  },
};

function SignInPage() {
  return (
    <div
      className="min-h-[100dvh] w-full flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(160deg, #1b1b1f, #2b0f10)' }}
    >
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-red-800/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-800/20 blur-[100px] rounded-full" />
      </div>
      <div className="relative z-10 w-full">
        <SignIn
          routing="path"
          path={`${basePath}/sign-in`}
          signUpUrl={`${basePath}/sign-up`}
        />
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div
      className="min-h-[100dvh] w-full flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(160deg, #1b1b1f, #2b0f10)' }}
    >
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-red-800/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-800/20 blur-[100px] rounded-full" />
      </div>
      <div className="relative z-10 w-full">
        <SignUp
          routing="path"
          path={`${basePath}/sign-up`}
          signInUrl={`${basePath}/sign-in`}
        />
      </div>
    </div>
  );
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
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Switch>
            <Route path="/" component={AuthGate} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/admin">
              {() => <AdminPanel onBack={() => setLocation('/')} />}
            </Route>
            <Route path="/deposit">
              {() => <DepositPage onBack={() => setLocation('/')} />}
            </Route>
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
