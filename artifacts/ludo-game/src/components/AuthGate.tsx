import { useUser } from '@clerk/react';
import { useState } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { LogIn, ShieldCheck, Wallet } from 'lucide-react';

import { LudoGame } from './LudoGame';
import { HomeHub, GameStartConfig } from './HomeScreen';

const ADMIN_EMAIL = 'th9610610@gmail.com';
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export function AuthGate() {
  const { user, isSignedIn, isLoaded } = useUser();
  const [appScreen, setAppScreen] = useState<'home' | 'game'>('home');
  const [gameConfig, setGameConfig] = useState<GameStartConfig | null>(null);
  const [profilePlayerId, setProfilePlayerId] = useState<string | null>(null);
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);

  const userInfo = isSignedIn && user
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

  const isAdmin = Boolean(
    isSignedIn &&
    user?.emailAddresses.some((email) => email.emailAddress === ADMIN_EMAIL),
  );

  const floatingButtons = (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {!isSignedIn && (
        <Link href={`${basePath}/sign-in`}>
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl font-semibold text-sm text-white shadow-lg"
            style={{
              background: 'rgba(37,99,235,0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            <LogIn className="w-4 h-4" />
            লগইন
          </motion.button>
        </Link>
      )}

      {isSignedIn && (
        <Link href={`${basePath}/deposit`}>
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl font-semibold text-sm text-white shadow-lg"
            style={{
              background: 'rgba(5,150,105,0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            <Wallet className="w-4 h-4" />
            ডিপোজিট
          </motion.button>
        </Link>
      )}

      {isAdmin && (
        <Link href={`${basePath}/admin`}>
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl font-semibold text-sm text-white shadow-lg"
            style={{
              background: 'rgba(220,38,38,0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            <ShieldCheck className="w-4 h-4" />
            Admin
          </motion.button>
        </Link>
      )}
    </div>
  );

  if (appScreen === 'game' && gameConfig) {
    return (
      <div className="app-background-shell">
        <LudoGame
          userInfo={userInfo}
          initialConfig={gameConfig}
          onOpenPlayerProfile={(playerId) => {
            setProfilePlayerId(playerId);
          }}
          onBack={() => {
            setGameConfig(null);
            setAppScreen('home');
          }}
          onMatchFinished={() => {
            setGameConfig(null);
            setAppScreen('home');
            setHomeRefreshKey((value) => value + 1);
          }}
        />
        {profilePlayerId && (
          <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#050818]/80 backdrop-blur-sm">
            <HomeHub
              userInfo={userInfo}
              onStartGame={() => undefined}
              initialPlayerProfileId={profilePlayerId}
              onProfileBack={() => setProfilePlayerId(null)}
            />
          </div>
        )}
        {floatingButtons}
      </div>
    );
  }

  return (
    <div className="app-background-shell">
      <HomeHub
        userInfo={userInfo}
        initialPlayerProfileId={profilePlayerId}
        onProfileOpened={() => setProfilePlayerId(null)}
        refreshKey={homeRefreshKey}
        onStartGame={(config) => {
          setGameConfig(config);
          setAppScreen('game');
        }}
      />
      {floatingButtons}
    </div>
  );
}