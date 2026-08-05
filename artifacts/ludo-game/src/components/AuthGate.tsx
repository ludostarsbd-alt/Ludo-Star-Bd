import { useUser, useSignIn } from '@clerk/react';
import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { motion } from 'framer-motion';
import { Mail, LogIn, ShieldCheck, Wallet } from 'lucide-react';

const ADMIN_EMAIL = 'th9610610@gmail.com';
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
import { LudoGame } from './LudoGame';
import { HomeHub, GameStartConfig } from './HomeScreen';

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.43c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.39-1.32 2.76-2.53 3.96zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  );
}

export function AuthGate() {
  const { user, isSignedIn, isLoaded } = useUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { signIn, isLoaded: signInLoaded } = useSignIn() as any;

  // Persist guest mode across page refreshes
  const [guestMode, setGuestMode] = useState<boolean>(
    () => localStorage.getItem('ludo_guest_mode') === 'true',
  );

  // Top-level navigation: 'home' hub or active 'game'
  const [appScreen, setAppScreen] = useState<'home' | 'game'>('home');
  const [gameConfig, setGameConfig] = useState<GameStartConfig | null>(null);

  const [, setLocation] = useLocation();

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (!isLoaded) {
    return (
      <div
        className="min-h-[100dvh] flex items-center justify-center"
        style={{ background: 'rgba(5, 7, 20, 0.28)' }}
      >
        <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Authenticated (or guest) ──────────────────────────────────────────────────
  if (isSignedIn || guestMode) {
    const userInfo = isSignedIn
      ? {
          id: user.id,
          name:
            user.firstName ||
            user.username ||
            user.emailAddresses?.[0]?.emailAddress?.split('@')[0] ||
            'Player',
          imageUrl: user.imageUrl || null,
        }
      : null;

    const isAdmin =
      isSignedIn &&
      user.emailAddresses.some((e) => e.emailAddress === ADMIN_EMAIL);

    // Floating buttons shown in all signed-in screens
    const FloatingButtons = (
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
        {/* Deposit button — visible to all signed-in users */}
        {isSignedIn && (
          <Link href={`${basePath}/deposit`}>
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl font-semibold text-sm text-white shadow-lg"
              style={{ background: 'rgba(5,150,105,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              <Wallet className="w-4 h-4" />
              ডিপোজিট
            </motion.button>
          </Link>
        )}
        {/* Admin badge — only for admin email */}
        {isAdmin && (
          <Link href={`${basePath}/admin`}>
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl font-semibold text-sm text-white shadow-lg"
              style={{ background: 'rgba(220,38,38,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              <ShieldCheck className="w-4 h-4" />
              Admin
            </motion.button>
          </Link>
        )}
      </div>
    );

    // Show the game
    if (appScreen === 'game' && gameConfig) {
      return (
        <div className="app-background-shell">
          <LudoGame
            userInfo={userInfo}
            initialConfig={gameConfig}
            onBack={() => {
              setGameConfig(null);
              setAppScreen('home');
            }}
          />
          {FloatingButtons}
        </div>
      );
    }

    // Show the home hub (default)
    return (
      <div className="app-background-shell">
        <HomeHub
          userInfo={userInfo}
          onStartGame={(config) => {
            setGameConfig(config);
            setAppScreen('game');
          }}
        />
        {FloatingButtons}
      </div>
    );
  }

  // ── OAuth helpers ─────────────────────────────────────────────────────────────
  const loginWithGoogle = async () => {
    if (!signInLoaded || !signIn) return;
    await signIn.authenticateWithRedirect({
      strategy: 'oauth_google',
      redirectUrl: `${basePath}/sign-in/sso-callback`,
      redirectUrlComplete: basePath || '/',
    });
  };

  const loginWithApple = async () => {
    if (!signInLoaded || !signIn) return;
    await signIn.authenticateWithRedirect({
      strategy: 'oauth_apple',
      redirectUrl: `${basePath}/sign-in/sso-callback`,
      redirectUrlComplete: basePath || '/',
    });
  };

  // ── Login screen ──────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-[100dvh] w-full flex items-center justify-center px-4 py-6"
      style={{ background: 'rgba(5, 7, 20, 0.28)' }}
    >
      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-red-800/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-800/20 blur-[100px] rounded-full" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-[340px] flex flex-col items-center gap-4"
      >
        {/* Logo + title */}
        <div className="flex flex-col items-center gap-3 mb-2">
          <img src={`${basePath}/logo.svg`} alt="Ludo" className="w-16 h-16" />
          <h1 className="text-4xl font-black text-white tracking-widest uppercase">Ludo</h1>
          <p className="text-slate-400 text-sm">লগইন করুন বা গেস্ট হিসেবে খেলুন</p>
        </div>

        {/* Social login buttons */}
        <div className="w-full flex flex-col gap-3">
          <button
            onClick={loginWithGoogle}
            className="w-full py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-3 transition-all"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.14)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          >
            <GoogleIcon /> Google দিয়ে লগইন
          </button>

          <button
            onClick={loginWithApple}
            className="w-full py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-3 transition-all"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.14)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          >
            <AppleIcon /> Apple দিয়ে লগইন
          </button>

          <button
            onClick={() => setLocation('/sign-in')}
            className="w-full py-3 px-4 rounded-xl font-semibold text-white flex items-center justify-center gap-3 transition-all"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.14)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          >
            <Mail className="w-5 h-5" /> Email দিয়ে লগইন
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 w-full">
          <div className="flex-1 h-px bg-white/15" />
          <span className="text-slate-500 text-xs">অথবা</span>
          <div className="flex-1 h-px bg-white/15" />
        </div>

        {/* Guest */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            localStorage.setItem('ludo_guest_mode', 'true');
            setGuestMode(true);
          }}
          className="w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
          style={{
            color: 'rgba(255,255,255,0.6)',
            border: '1px solid rgba(255,255,255,0.13)',
          }}
        >
          <LogIn className="w-4 h-4" />
          গেস্ট হিসেবে খেলুন
        </motion.button>
      </motion.div>
    </div>
  );
}
