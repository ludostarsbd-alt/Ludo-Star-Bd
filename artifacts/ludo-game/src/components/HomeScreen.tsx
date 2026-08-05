/**
 * HomeScreen.tsx
 * Full game hub — shown after authentication.
 * Includes: Home, Store, Deposit, Message, Notifications, Settings,
 * Profile, Ranking, Daily Bonus, Invite screens.
 * Also handles game-mode selection (Classic / Quick) and player count (2 / 4).
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Gift, Users, Trophy, ChevronRight, ChevronLeft, UserPlus,
  Home as HomeIcon, Store as StoreIcon, MessageCircle, Bell, Settings,
  Coins, Check, X, Volume2, Music, Vibrate, Globe2, ShieldCheck,
  HelpCircle, LogOut, UserCog, Search, Copy, Loader2, Banknote,
  Award, Swords, Crown, Flag, Zap, Sparkles,
  Lock, Headphones, FileQuestion, FileText, KeyRound, MailPlus, Scale,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClerk, useUser } from '@clerk/react';
import { useLocation } from 'wouter';
import { TournamentScreen } from './TournamentScreen';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

/* ─── Public types ─────────────────────────────────────────────────────────── */

export interface GameStartConfig {
  mode: 'classic' | 'quick';
  playerCount: 2 | 3 | 4;
  teamMode?: boolean;
  matchType?: 'quick-match' | 'nearby' | 'ranked' | 'create-room' | 'join-code' | 'offline';
  online?: boolean;
  roomId?: string;
  room?: {
    id: string;
    code: string;
    mode: string;
    maxPlayers: number;
    status: string;
    seats: Array<{
      clerkUserId: string;
      displayName: string;
      color: 'red' | 'green' | 'blue' | 'yellow';
      seatIndex: number;
      isReady: boolean;
    }>;
  };
}

export interface HomeHubProps {
  userInfo: { name: string; imageUrl: string | null } | null;
  onStartGame: (config: GameStartConfig) => void;
}

/* ─── Profile state ─────────────────────────────────────────────────────────── */

interface Profile {
  username: string;
  level: number;
  coins: number;
  cash: number;
}

function loadProfile(userInfo: HomeHubProps['userInfo']): Profile {
  try {
    const saved = localStorage.getItem('ludo_profile');
    if (saved) return JSON.parse(saved) as Profile;
  } catch { /* ignore */ }
  return {
    username: userInfo?.name ?? 'Player',
    level: 1,
    coins: 12_200,
    cash: 4_000,
  };
}

/* ─── Shared UI ─────────────────────────────────────────────────────────────── */

type Gradient = 'purple' | 'dark' | 'navy';

function GlassCard({
  children,
  gradient = 'dark',
  interactive = false,
  className = '',
}: {
  children: React.ReactNode;
  gradient?: Gradient;
  interactive?: boolean;
  className?: string;
}) {
  const g: Record<Gradient, string> = {
    purple: 'from-purple-900/60 via-purple-800/30 to-black/60 border-purple-400/30',
    dark:   'from-yellow-950/80 via-amber-900/40 to-[#0a0800]/90 border-orange-500',
    navy:   'from-slate-900/80 via-slate-800/40 to-black/60 border-white/10',
  };
  return (
    <div
      className={`rounded-2xl border backdrop-blur-md bg-gradient-to-br ${g[gradient]}
        ${interactive ? 'hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer' : ''}
        ${className}`}
    >
      {children}
    </div>
  );
}

function TopBar({
  username, level, coins, cash, onPlusCoins, onPlusCash, onOpenProfile,
}: {
  username: string; level: number; coins: number; cash: number;
  onPlusCoins: () => void; onPlusCash: () => void; onOpenProfile: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 w-full max-w-md mx-auto">
      <button onClick={onOpenProfile} className="flex items-center gap-2 active:scale-95 transition-transform">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 border-2 border-white/30 flex items-center justify-center text-sm font-black text-white">
          {username[0] ?? 'P'}
        </div>
        <div className="flex flex-col leading-none items-start">
          <span className="text-white text-xs font-bold">{username}</span>
          <span className="text-cyan-300 text-[10px] font-semibold">Lvl {level}</span>
        </div>
      </button>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-black/40 border border-yellow-400/40 rounded-full pl-2 pr-1 py-0.5">
          <span className="text-yellow-300 text-xs font-bold">🪙 {coins.toLocaleString()}</span>
          <button onClick={onPlusCoins} className="w-5 h-5 rounded-full bg-yellow-400 text-black text-xs font-black flex items-center justify-center active:scale-90 transition-transform">+</button>
        </div>
        <div className="flex items-center gap-1 bg-black/40 border border-green-400/40 rounded-full pl-2 pr-1 py-0.5">
          <span className="text-green-300 text-xs font-bold">💵 {cash.toLocaleString()}</span>
          <button onClick={onPlusCash} className="w-5 h-5 rounded-full bg-green-400 text-black text-xs font-black flex items-center justify-center active:scale-90 transition-transform">+</button>
        </div>
      </div>
    </div>
  );
}

type NavKey = 'home' | 'store' | 'message' | 'notifi' | 'settings';

function BottomNav({ active, onNavigate }: { active: NavKey; onNavigate: (k: NavKey) => void }) {
  const items: { key: NavKey; icon: React.ElementType; label: string }[] = [
    { key: 'home',     icon: HomeIcon,      label: 'Home'     },
    { key: 'store',    icon: StoreIcon,     label: 'Store'    },
    { key: 'message',  icon: MessageCircle, label: 'Message'  },
    { key: 'notifi',   icon: Bell,          label: 'Notifi'   },
    { key: 'settings', icon: Settings,      label: 'Settings' },
  ];
  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 bg-[#050818]/95 border-t border-white/10 backdrop-blur-md">
      <div className="max-w-md mx-auto flex items-center justify-around py-2">
        {items.map(({ key, icon: Icon, label }) => {
          const isActive = active === key;
          return (
            <button key={key} onClick={() => onNavigate(key)} className="flex flex-col items-center gap-0.5 px-2 py-1 active:scale-90 transition-transform">
              <Icon size={20} className={isActive ? 'text-cyan-300' : 'text-white/40'} />
              <span className={`text-[9px] font-semibold ${isActive ? 'text-cyan-300' : 'text-white/40'}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScreenHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 w-full max-w-md mx-auto">
      <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center active:scale-90 transition-transform">
        <ChevronLeft size={18} className="text-white" />
      </button>
      <h2 className="text-white font-black italic text-lg tracking-wide">{title}</h2>
      <div className="w-9 h-9 flex items-center justify-center">{right}</div>
    </div>
  );
}

function ScreenShell({
  children, activeNav, onNavigate,
}: {
  children: React.ReactNode; activeNav: NavKey; onNavigate: (k: NavKey) => void;
}) {
  return (
    <div className="h-screen w-full relative flex flex-col overflow-x-hidden overflow-y-hidden bg-[#050818]">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-indigo-950/70 via-[#050818] to-black opacity-80" />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#050818]/60 via-[#050818]/20 to-[#050818] pointer-events-none" />
      <div className="relative z-10 flex flex-col flex-1 pb-24 overflow-y-auto">{children}</div>
      <BottomNav active={activeNav} onNavigate={onNavigate} />
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className={`w-11 h-6 rounded-full relative transition-colors duration-200 ${checked ? 'bg-cyan-500' : 'bg-white/15'}`}>
      <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200" style={{ left: checked ? 22 : 2 }} />
    </button>
  );
}

/* ─── Store ─────────────────────────────────────────────────────────────────── */

const COIN_PACKS = [
  { id: 'c1', amount: 1_000,     price: 10   },
  { id: 'c2', amount: 5_000,     price: 45   },
  { id: 'c3', amount: 10_000,    price: 85,   badge: 'জনপ্রিয়'  },
  { id: 'c4', amount: 25_000,    price: 200  },
  { id: 'c5', amount: 50_000,    price: 380  },
  { id: 'c6', amount: 100_000,   price: 700,  badge: 'সেরা মূল্য' },
  { id: 'c7', amount: 500_000,   price: 3200, badge: 'মেগা প্যাক' },
  { id: 'c8', amount: 1_000_000, price: 6000, badge: 'আলটিমেট'   },
];

function StoreScreen({
  profile, onNavigate, onBuy,
}: {
  profile: Profile;
  onNavigate: (k: string) => void;
  onBuy: (amount: number, price: number) => void;
}) {
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  function handleBuy(amount: number, price: number) {
    if (profile.cash < price) {
      setToast({ type: 'err', text: 'অপর্যাপ্ত ক্যাশ! আগে ডিপোজিট করুন' });
      setTimeout(() => setToast(null), 2200);
      return;
    }
    onBuy(amount, price);
    setToast({ type: 'ok', text: `${amount.toLocaleString()} কয়েন যোগ হয়েছে` });
    setTimeout(() => setToast(null), 2200);
  }

  return (
    <ScreenShell activeNav="store" onNavigate={k => onNavigate(k)}>
      <ScreenHeader title="Store" onBack={() => onNavigate('home')} />
      <div className="px-4 w-full max-w-md mx-auto flex-1">
        <div className="flex gap-3 mb-4">
          <div className="flex-1 rounded-xl bg-black/40 border border-yellow-400/30 px-3 py-2 flex items-center justify-between">
            <span className="text-yellow-300 text-xs font-bold">🪙 কয়েন</span>
            <span className="text-white font-black text-sm">{profile.coins.toLocaleString()}</span>
          </div>
          <div className="flex-1 rounded-xl bg-black/40 border border-green-400/30 px-3 py-2 flex items-center justify-between">
            <span className="text-green-300 text-xs font-bold">💵 ক্যাশ</span>
            <span className="text-white font-black text-sm">৳{profile.cash.toLocaleString()}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 pb-4">
          {COIN_PACKS.map(p => (
            <div key={p.id} className="relative rounded-2xl border border-white/10 bg-white/5 p-3 flex flex-col items-center gap-1">
              {p.badge && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-black px-2 py-0.5 rounded-full bg-gradient-to-r from-yellow-400 to-orange-400 text-black whitespace-nowrap">
                  {p.badge}
                </span>
              )}
              <span className="text-2xl leading-none mt-1">🪙</span>
              <span className="text-white font-black text-sm">{p.amount.toLocaleString()}</span>
              <button
                onClick={() => handleBuy(p.amount, p.price)}
                disabled={profile.cash < p.price}
                className={`mt-1 w-full rounded-lg text-xs font-bold py-1.5 active:scale-95 transition-transform
                  ${profile.cash < p.price ? 'bg-white/10 text-white/40' : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white'}`}
              >
                ৳{p.price.toLocaleString()}
              </button>
            </div>
          ))}
        </div>
        <p className="text-white/40 text-[10px] text-center pb-4">ক্যাশ দিয়ে কয়েন কিনুন। ক্যাশ ডিপোজিট করতে (+) বাটন চাপুন।</p>
      </div>
      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-30 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-1 ${toast.type === 'err' ? 'bg-red-500' : 'bg-emerald-500'}`}>
          {toast.type === 'err' ? <X size={14} /> : <Check size={14} />} {toast.text}
        </div>
      )}
    </ScreenShell>
  );
}

/* ─── Deposit ────────────────────────────────────────────────────────────────── */

const DEPOSIT_METHODS = [
  { id: 'bkash',  label: 'bKash',  number: '01711-223344', color: 'from-pink-600 to-pink-700'       },
  { id: 'nagad',  label: 'Nagad',  number: '01911-556677', color: 'from-orange-600 to-red-600'      },
  { id: 'rocket', label: 'Rocket', number: '01611-889900', color: 'from-purple-600 to-indigo-700'   },
];

function DepositScreen({
  profile, onNavigate, onDeposit,
}: {
  profile: Profile;
  onNavigate: (k: string) => void;
  onDeposit: (amount: number) => void;
}) {
  const [method, setMethod] = useState(DEPOSIT_METHODS[0].id);
  const [amount, setAmount] = useState('');
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const selected = DEPOSIT_METHODS.find(m => m.id === method)!;
  const num = Number(amount) || 0;

  function submit() {
    if (num < 100) return;
    onDeposit(num);
    setDone(true);
  }

  if (done) {
    return (
      <ScreenShell activeNav="home" onNavigate={k => onNavigate(k)}>
        <ScreenHeader title="Deposit" onBack={() => onNavigate('home')} />
        <div className="px-4 flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-400/40 flex items-center justify-center">
            <Check size={30} className="text-green-300" />
          </div>
          <h3 className="text-white font-black text-lg">ডিপোজিট সফল!</h3>
          <p className="text-white/50 text-xs">৳{num.toLocaleString()} আপনার ক্যাশ ব্যালেন্সে যোগ হয়েছে</p>
          <button onClick={() => onNavigate('home')} className="w-full max-w-xs rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-sm py-3 active:scale-95 transition-transform">
            হোমে ফিরুন
          </button>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell activeNav="home" onNavigate={k => onNavigate(k)}>
      <ScreenHeader title="Deposit" onBack={() => onNavigate('home')} />
      <div className="px-4 w-full max-w-md mx-auto flex-1 pb-4">
        <div className="grid grid-cols-3 gap-2 mb-4">
          {DEPOSIT_METHODS.map(m => (
            <button key={m.id} onClick={() => setMethod(m.id)}
              className={`rounded-xl border p-2 text-center transition-all ${method === m.id ? 'border-white/60 bg-white/10' : 'border-white/10 bg-white/5'}`}>
              <div className={`w-full h-8 rounded-lg bg-gradient-to-r ${m.color} mb-1 flex items-center justify-center`}>
                <span className="text-white text-[10px] font-black">{m.label}</span>
              </div>
              {method === m.id && <Check size={12} className="text-white mx-auto" />}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 mb-4">
          <span className="text-white font-bold text-sm tracking-wide">{selected.number}</span>
          <button onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }}
            className="flex items-center gap-1 text-cyan-300 text-[11px] font-bold active:scale-90 transition-transform">
            <Copy size={13} /> {copied ? 'কপি হয়েছে' : 'কপি'}
          </button>
        </div>
        <p className="text-white/50 text-[11px] mb-2">কত টাকা পাঠিয়েছেন?</p>
        <div className="flex gap-2 mb-2 flex-wrap">
          {[500, 1000, 2000, 5000].map(a => (
            <button key={a} onClick={() => setAmount(String(a))}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors
                ${num === a ? 'bg-green-500 border-green-400 text-black' : 'bg-white/5 border-white/10 text-white/70'}`}>
              ৳{a.toLocaleString()}
            </button>
          ))}
        </div>
        <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="অ্যামাউন্ট লিখুন (ন্যূনতম ৳১০০)"
          className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-white text-sm outline-none focus:border-green-400/50 mb-4" />
        <button onClick={submit} disabled={num < 100}
          className={`w-full rounded-xl font-bold text-sm py-3 flex items-center justify-center gap-2 transition-all active:scale-95
            ${num >= 100 ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white' : 'bg-white/10 text-white/30'}`}>
          ডিপোজিট সাবমিট করুন
        </button>
      </div>
    </ScreenShell>
  );
}

/* ─── Message ────────────────────────────────────────────────────────────────── */

const DEMO_CHATS = [
  { id: 'm1', name: 'Tanvir', time: '2m', unread: 2, messages: [{ from: 'them', text: 'ভাই পরের রাউন্ডে খেলবি?', time: '10:03' }] },
  { id: 'm2', name: 'Ayesha', time: '18m', unread: 0, messages: [{ from: 'me', text: 'সেমি-ফাইনালে পৌঁছেছি 😄', time: '9:40' }] },
  { id: 'm3', name: 'Team StarBD', time: '1h', unread: 5, messages: [{ from: 'them', text: 'নতুন টুর্নামেন্ট শুরু আজ রাতে', time: '9:00' }] },
];

type ChatMsg = { from: string; text: string; time: string };
type Chat = { id: string; name: string; time: string; unread: number; messages: ChatMsg[] };

function MessageScreen({
  chats, onOpenChat, onNavigate,
}: {
  chats: Chat[]; onOpenChat: (id: string) => void; onNavigate: (k: string) => void;
}) {
  const [q, setQ] = useState('');
  const filtered = chats.filter(c => c.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <ScreenShell activeNav="message" onNavigate={k => onNavigate(k)}>
      <ScreenHeader title="Message" onBack={() => onNavigate('home')} />
      <div className="px-4 w-full max-w-md mx-auto flex-1 pb-4">
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-2 mb-4">
          <Search size={14} className="text-white/40" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="খুঁজুন..."
            className="bg-transparent outline-none text-white text-xs placeholder:text-white/30 flex-1" />
        </div>
        <div className="flex flex-col gap-2">
          {filtered.map(c => {
            const last = c.messages[c.messages.length - 1];
            return (
              <button key={c.id} onClick={() => onOpenChat(c.id)}
                className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-2.5 active:scale-[0.98] transition-transform text-left">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center text-white font-black text-sm shrink-0">
                  {c.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-white text-xs font-bold truncate">{c.name}</span>
                    <span className="text-white/40 text-[10px] shrink-0">{c.time}</span>
                  </div>
                  <span className="text-white/50 text-[11px] truncate block">
                    {last.from === 'me' ? 'তুমি: ' : ''}{last.text}
                  </span>
                </div>
                {c.unread > 0 && (
                  <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-cyan-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {c.unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </ScreenShell>
  );
}

function ChatScreen({ chat, onSend, onBack }: { chat: Chat; onSend: (text: string) => void; onBack: () => void }) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat.messages.length]);

  function send() {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  }

  return (
    <div className="h-screen w-full relative flex flex-col bg-[#050818]">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-indigo-950/70 via-[#050818] to-black opacity-80" />
      <div className="relative z-10 flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
          <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center active:scale-90 transition-transform">
            <ChevronLeft size={18} className="text-white" />
          </button>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center text-white font-black text-xs">
            {chat.name[0]}
          </div>
          <span className="text-white font-bold text-sm flex-1 truncate">{chat.name}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
          {chat.messages.map((m, i) => (
            <div key={i} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-xs ${m.from === 'me' ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white' : 'bg-white/10 text-white'}`}>
                <span>{m.text}</span>
                <span className="block text-[9px] opacity-60 mt-1 text-right">{m.time}</span>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="px-4 py-3 flex items-center gap-2 border-t border-white/5">
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="মেসেজ লিখুন..."
            className="flex-1 rounded-full bg-white/5 border border-white/10 px-4 py-2.5 text-white text-xs outline-none focus:border-cyan-400/50" />
          <button onClick={send} className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center active:scale-90">
            <ChevronRight size={18} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Notifications ─────────────────────────────────────────────────────────── */

function NotificationsScreen({ onNavigate }: { onNavigate: (k: string) => void }) {
  const notifs = [
    { id: 'n1', icon: Gift,     color: 'purple', title: 'ডেইলি বোনাস রেডি',         sub: 'আজকের বোনাস সংগ্রহ করুন',       time: '10m' },
    { id: 'n2', icon: Trophy,   color: 'yellow', title: 'সেমি-ফাইনালে পৌঁছেছেন!',  sub: 'টুর্নামেন্টে দুর্দান্ত পারফরম্যান্স', time: '1h'  },
    { id: 'n3', icon: UserPlus, color: 'green',  title: 'রাকিব ফ্রেন্ড রিকোয়েস্ট গ্রহণ করেছে', sub: '', time: '3h' },
  ];
  const colorMap: Record<string, string> = {
    purple: 'bg-purple-500/20 text-purple-300 border-purple-400/40',
    yellow: 'bg-yellow-500/20 text-yellow-300 border-yellow-400/40',
    green:  'bg-green-500/20 text-green-300 border-green-400/40',
  };
  return (
    <ScreenShell activeNav="notifi" onNavigate={k => onNavigate(k)}>
      <ScreenHeader title="Notifications" onBack={() => onNavigate('home')} />
      <div className="px-4 w-full max-w-md mx-auto flex-1 flex flex-col gap-2 pb-4">
        {notifs.map(n => {
          const Icon = n.icon;
          return (
            <div key={n.id} className="flex items-start gap-3 rounded-xl bg-white/5 border border-white/10 p-2.5">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center border shrink-0 ${colorMap[n.color]}`}>
                <Icon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-white text-xs font-bold block">{n.title}</span>
                {n.sub && <span className="text-white/50 text-[11px] block">{n.sub}</span>}
              </div>
              <span className="text-white/30 text-[10px] shrink-0">{n.time}</span>
            </div>
          );
        })}
      </div>
    </ScreenShell>
  );
}

/* ─── Settings ───────────────────────────────────────────────────────────────── */

function SettingsScreen({
  profile, onNavigate, onSignOut,
}: {
  profile: Profile; onNavigate: (k: string) => void; onSignOut: () => void;
}) {
  const [sound, setSound] = useState(true);
  const [music, setMusic] = useState(true);
  const [vibration, setVibration] = useState(false);
  const { openUserProfile } = useClerk();

  const rowCls = "flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3 active:scale-[0.98] transition-transform w-full text-left";
  const iconBox = (color: string) => `w-8 h-8 rounded-lg flex items-center justify-center ${color}`;

  return (
    <ScreenShell activeNav="settings" onNavigate={k => onNavigate(k)}>
      <ScreenHeader title="Settings" onBack={() => onNavigate('home')} />
      <div className="px-4 w-full max-w-md mx-auto flex-1 flex flex-col gap-4 pb-6 overflow-y-auto">

        {/* Profile card */}
        <GlassCard gradient="navy" className="p-3 flex items-center gap-3" interactive>
          <button onClick={() => onNavigate('profile')} className="flex items-center gap-3 w-full text-left">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 border-2 border-white/20 flex items-center justify-center text-white font-black">
              {profile.username[0]}
            </div>
            <div className="flex-1">
              <span className="text-white font-bold text-sm block">{profile.username}</span>
              <span className="text-cyan-300 text-[11px]">Level {profile.level}</span>
            </div>
            <ChevronRight size={16} className="text-white/40" />
          </button>
        </GlassCard>

        {/* Preferences */}
        <div>
          <p className="text-white/50 text-[11px] font-semibold uppercase tracking-wider mb-2">প্রেফারেন্স</p>
          <div className="flex flex-col gap-2">
            {([
              { icon: Volume2, label: 'সাউন্ড ইফেক্ট', val: sound, set: setSound },
              { icon: Music,   label: 'মিউজিক',        val: music, set: setMusic },
              { icon: Vibrate, label: 'ভাইব্রেশন',     val: vibration, set: setVibration },
            ] as const).map(({ icon: Icon, label, val, set }) => (
              <button key={label} className={rowCls}>
                <div className={iconBox('bg-white/10 text-cyan-300')}><Icon size={16} /></div>
                <span className="flex-1 text-xs font-bold text-white">{label}</span>
                <Toggle checked={val} onChange={set} />
              </button>
            ))}
            <button className={rowCls}>
              <div className={iconBox('bg-white/10 text-cyan-300')}><Globe2 size={16} /></div>
              <span className="flex-1 text-xs font-bold text-white">ভাষা</span>
              <span className="text-white/50 text-[11px]">বাংলা</span>
            </button>
          </div>
        </div>

        {/* Privacy & Security */}
        <div>
          <p className="text-white/50 text-[11px] font-semibold uppercase tracking-wider mb-2">🔒 Privacy &amp; Security</p>
          <div className="flex flex-col gap-2">
            <button className={rowCls}>
              <div className={iconBox('bg-purple-500/20 text-purple-300')}><Lock size={16} /></div>
              <span className="flex-1 text-xs font-bold text-white">Privacy</span>
              <ChevronRight size={16} className="text-white/30" />
            </button>
            <button className={rowCls}>
              <div className={iconBox('bg-blue-500/20 text-blue-300')}><Scale size={16} /></div>
              <span className="flex-1 text-xs font-bold text-white">Help &amp; Legal</span>
              <ChevronRight size={16} className="text-white/30" />
            </button>
            <button className={rowCls}>
              <div className={iconBox('bg-cyan-500/20 text-cyan-300')}><Headphones size={16} /></div>
              <span className="flex-1 text-xs font-bold text-white">Support</span>
              <ChevronRight size={16} className="text-white/30" />
            </button>
            <button className={rowCls}>
              <div className={iconBox('bg-green-500/20 text-green-300')}><FileQuestion size={16} /></div>
              <span className="flex-1 text-xs font-bold text-white">FAQ</span>
              <ChevronRight size={16} className="text-white/30" />
            </button>
            <button className={rowCls}>
              <div className={iconBox('bg-indigo-500/20 text-indigo-300')}><FileText size={16} /></div>
              <span className="flex-1 text-xs font-bold text-white">Terms &amp; Conditions</span>
              <ChevronRight size={16} className="text-white/30" />
            </button>
          </div>
        </div>

        {/* Account */}
        <div>
          <p className="text-white/50 text-[11px] font-semibold uppercase tracking-wider mb-2">🚪 Account</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => openUserProfile({ appearance: { elements: { rootBox: { zIndex: 9999 } } } })}
              className={rowCls}
            >
              <div className={iconBox('bg-amber-500/20 text-amber-300')}><KeyRound size={16} /></div>
              <span className="flex-1 text-xs font-bold text-white">Reset Password</span>
              <ChevronRight size={16} className="text-white/30" />
            </button>
            <button
              onClick={() => openUserProfile({ appearance: { elements: { rootBox: { zIndex: 9999 } } } })}
              className={rowCls}
            >
              <div className={iconBox('bg-sky-500/20 text-sky-300')}><MailPlus size={16} /></div>
              <span className="flex-1 text-xs font-bold text-white">Add New Email</span>
              <ChevronRight size={16} className="text-white/30" />
            </button>
            <button
              onClick={onSignOut}
              className="flex items-center gap-3 rounded-xl bg-red-500/10 border border-red-400/30 p-3 active:scale-[0.98] transition-transform w-full text-left"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-500/20 text-red-300"><LogOut size={16} /></div>
              <span className="flex-1 text-xs font-bold text-red-300">Logout</span>
            </button>
          </div>
        </div>

      </div>
    </ScreenShell>
  );
}

/* ─── Profile ─────────────────────────────────────────────────────────────────── */

function ProfileScreen({ profile, onNavigate }: { profile: Profile; onNavigate: (k: string) => void }) {
  return (
    <ScreenShell activeNav="home" onNavigate={k => onNavigate(k)}>
      <ScreenHeader title="Profile" onBack={() => onNavigate('home')} />
      <div className="px-4 w-full max-w-md mx-auto flex-1 flex flex-col gap-4 pb-4">
        <div className="flex flex-col items-center pt-2 pb-1">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-cyan-400 blur-xl opacity-40 scale-110" />
            <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 border-4 border-white/20 flex items-center justify-center text-3xl font-black text-white">
              {profile.username[0]}
            </div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-yellow-400 border-2 border-[#050818] flex items-center justify-center">
              <span className="text-[10px] font-black text-black">{profile.level}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            <span className="text-white font-black text-lg italic">{profile.username}</span>
            <span className="text-xl leading-none">🇧🇩</span>
          </div>
          <span className="text-cyan-300 text-xs font-semibold">Level {profile.level} Player</span>
        </div>

        <GlassCard gradient="navy" className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-bold text-sm flex items-center gap-1.5">
              <Trophy size={15} className="text-yellow-300" /> Total Wins
            </span>
            <span className="text-white font-black text-sm">100 <span className="text-white/40 font-semibold">of 350</span></span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-yellow-400" style={{ width: '28.6%' }} />
          </div>
          <span className="text-white/40 text-[10px] mt-1 block">29% ম্যাচ জয়ের হার</span>
        </GlassCard>

        <div>
          <p className="text-white/50 text-[11px] mb-2">জয়ের বিবরণ</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '2 প্লেয়ার উইন', value: 45, icon: Users,  color: 'text-cyan-300 bg-cyan-500/15 border-cyan-400/30'   },
              { label: '4 প্লেয়ার উইন', value: 45, icon: Swords, color: 'text-purple-300 bg-purple-500/15 border-purple-400/30' },
              { label: 'টুর্নামেন্ট',   value: 10, icon: Trophy, color: 'text-yellow-300 bg-yellow-500/15 border-yellow-400/30' },
            ].map(w => {
              const Icon = w.icon;
              return (
                <div key={w.label} className={`rounded-xl border p-2.5 flex flex-col items-center gap-1 ${w.color}`}>
                  <Icon size={16} />
                  <span className="text-white font-black text-base leading-none">{w.value}</span>
                  <span className="text-[9px] text-center text-white/60 leading-tight">{w.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tournament Stage Stats */}
        <div>
          <p className="text-white/50 text-[11px] mb-2">টুর্নামেন্ট স্টেজ</p>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden divide-y divide-white/5">
            {[
              { stage: 'Knockout',      count: 3, icon: '⚔️', color: 'text-red-300'    },
              { stage: 'Quarter Final', count: 3, icon: '🎯', color: 'text-orange-300' },
              { stage: 'Semifinal',     count: 3, icon: '🔥', color: 'text-yellow-300' },
              { stage: 'Final',         count: 1, icon: '🏆', color: 'text-cyan-300'   },
            ].map(s => (
              <div key={s.stage} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">{s.icon}</span>
                  <span className="text-white/80 text-xs font-semibold">{s.stage}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`font-black text-sm ${s.color}`}>{s.count}</span>
                  <span className="text-white/30 text-[10px]">বার</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}

/* ─── Ranking ─────────────────────────────────────────────────────────────────── */

const LEADERBOARD = [
  { rank: 1, name: 'Shakil Ahmed',   wins: 512, medal: '🥇' },
  { rank: 2, name: 'Nusrat Jahan',   wins: 478, medal: '🥈' },
  { rank: 3, name: 'Rakib Hasan',    wins: 440, medal: '🥉' },
  { rank: 4, name: 'Tanvir Islam',   wins: 390 },
  { rank: 5, name: 'Mim Akter',      wins: 355 },
  { rank: 6, name: 'Player',         wins: 100, me: true },
  { rank: 7, name: 'Sabbir Khan',    wins: 88  },
  { rank: 8, name: 'Ayesha Siddika', wins: 76  },
];

function RankingScreen({ onNavigate }: { onNavigate: (k: string) => void }) {
  return (
    <ScreenShell activeNav="home" onNavigate={k => onNavigate(k)}>
      <ScreenHeader title="Ranking" onBack={() => onNavigate('home')} />
      <div className="px-4 w-full max-w-md mx-auto flex-1 pb-4">
        <div className="flex flex-col gap-3 mb-6 mt-2">
          <div className="w-full flex justify-center">
            <div className="w-[70%] flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-2">
              <div className="relative w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 border-2 border-white/20 flex items-center justify-center text-white font-black text-base shrink-0">
                {LEADERBOARD[0].name[0]}
                <span className="absolute -top-2 -left-2 text-lg leading-none">{LEADERBOARD[0].medal}</span>
              </div>
              <span className="flex-1 text-white font-black uppercase tracking-wide text-sm truncate">{LEADERBOARD[0].name}</span>
              <span className="text-yellow-300 text-xs font-bold shrink-0">{LEADERBOARD[0].wins} 🏆</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {LEADERBOARD.slice(1, 3).map(p => (
              <div key={p.rank} className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 p-2">
                <div className="relative w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 border-2 border-white/20 flex items-center justify-center text-white font-black text-sm shrink-0">
                  {p.name[0]}
                  <span className="absolute -top-2 -left-2 text-base leading-none">{p.medal}</span>
                </div>
                <span className="flex-1 text-white font-black uppercase tracking-wide text-xs truncate">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl overflow-hidden border border-white/10 divide-y divide-white/5">
          {LEADERBOARD.slice(3).map(p => (
            <div key={p.rank} className={`flex items-center gap-3 px-3 py-2.5 ${(p as typeof LEADERBOARD[5]).me ? 'bg-gradient-to-r from-cyan-500/20 to-transparent' : 'bg-white/[0.02]'}`}>
              <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-black text-white/60 shrink-0">{p.rank}</span>
              <div className="relative w-10 h-10 rounded-lg bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center text-white font-black text-xs shrink-0 border border-white/10">
                {p.name[0]}
                {(p as typeof LEADERBOARD[5]).me && <span className="absolute -bottom-1 -right-1 bg-cyan-400 text-[#050818] text-[8px] font-black px-1 py-0.5 rounded-full">YOU</span>}
              </div>
              <span className={`flex-1 uppercase text-xs font-bold truncate ${(p as typeof LEADERBOARD[5]).me ? 'text-cyan-300' : 'text-white'}`}>{p.name}</span>
              <span className="flex items-center gap-1 bg-yellow-400/10 border border-yellow-400/20 rounded-full px-2 py-1 text-yellow-300 text-[11px] font-bold shrink-0">🏆 {p.wins}</span>
            </div>
          ))}
        </div>
      </div>
    </ScreenShell>
  );
}

/* ─── Daily Bonus ─────────────────────────────────────────────────────────────── */

const DAILY_BONUS = [100, 200, 300, 400, 500, 600, 700];

function DailyBonusScreen({
  profile, streak, onClaim, onNavigate,
}: {
  profile: Profile;
  streak: { day: number; claimedToday: boolean };
  onClaim: () => void;
  onNavigate: (k: string) => void;
}) {
  const { day, claimedToday } = streak;
  return (
    <ScreenShell activeNav="home" onNavigate={k => onNavigate(k)}>
      <ScreenHeader title="Daily Bonus" onBack={() => onNavigate('home')} />
      <div className="px-4 w-full max-w-md mx-auto flex-1 pb-4">
        <div className="rounded-xl bg-black/40 border border-yellow-400/30 px-3 py-2 flex items-center justify-between mb-4">
          <span className="text-yellow-300 text-xs font-bold">🪙 কয়েন ব্যালেন্স</span>
          <span className="text-white font-black text-sm">{profile.coins.toLocaleString()}</span>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-6">
          {DAILY_BONUS.map((amount, i) => {
            const dayNum = i + 1;
            const isPast    = dayNum < day || (dayNum === day && claimedToday);
            const isCurrent = dayNum === day && !claimedToday;
            return (
              <div key={dayNum} className={`rounded-xl border p-2 flex flex-col items-center gap-1 ${
                isCurrent ? 'bg-gradient-to-b from-yellow-400/20 to-transparent border-yellow-400/60 scale-[1.03]' :
                isPast ? 'bg-white/5 border-white/10 opacity-60' : 'bg-white/5 border-white/5 opacity-40'}`}>
                <span className="text-white/50 text-[9px] font-bold">Day {dayNum}</span>
                <span className="text-lg leading-none">{isPast ? '✅' : dayNum > day ? '🔒' : '🪙'}</span>
                <span className={`text-[10px] font-black ${isCurrent ? 'text-yellow-300' : 'text-white/60'}`}>{amount}</span>
              </div>
            );
          })}
        </div>
        <button onClick={onClaim} disabled={claimedToday}
          className={`w-full rounded-xl font-bold text-sm py-3 flex items-center justify-center gap-2 active:scale-95 transition-all
            ${claimedToday ? 'bg-white/10 text-white/30' : 'bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white shadow-[0_0_16px_rgba(168,85,247,0.4)]'}`}>
          <Gift size={16} />
          {claimedToday ? 'আজকের বোনাস নেওয়া হয়ে গেছে' : `Day ${day} বোনাস নিন (+${DAILY_BONUS[day - 1]} কয়েন)`}
        </button>
      </div>
    </ScreenShell>
  );
}

/* ─── Invite ──────────────────────────────────────────────────────────────────── */

function InviteScreen({ onNavigate }: { onNavigate: (k: string) => void }) {
  const [code] = useState(() => Math.random().toString(36).slice(2, 10).toUpperCase());
  const [copied, setCopied] = useState(false);
  return (
    <ScreenShell activeNav="home" onNavigate={k => onNavigate(k)}>
      <ScreenHeader title="Invite & Earn" onBack={() => onNavigate('home')} />
      <div className="px-4 w-full max-w-md mx-auto flex-1 pb-4">
        <GlassCard gradient="dark" className="p-4 mb-5 text-center">
          <p className="text-white/50 text-[11px] mb-1">তোমার ইনভাইট কোড</p>
          <span className="text-yellow-300 font-black text-2xl tracking-widest">{code}</span>
          <button onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }}
            className="mt-3 w-full rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 text-[#050818] font-bold text-xs py-2 flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
            <Copy size={13} /> {copied ? 'কপি হয়েছে!' : 'কোড কপি করুন'}
          </button>
        </GlassCard>
        <div className="flex flex-col gap-2">
          <div className="rounded-xl bg-purple-500/10 border border-purple-400/30 p-3 flex items-center gap-3">
            <Gift className="text-purple-300 shrink-0" size={20} />
            <div>
              <span className="text-white font-black text-sm block">তুমি পাবে: ১০০ কয়েন</span>
              <span className="text-white/50 text-[11px]">বন্ধু তোমার লিংক দিয়ে অ্যাকাউন্ট খুললে</span>
            </div>
          </div>
          <div className="rounded-xl bg-green-500/10 border border-green-400/30 p-3 flex items-center gap-3">
            <span className="text-lg">🔗</span>
            <div className="flex-1">
              <span className="text-white text-xs font-bold block">ইনভাইট লিংক দিয়ে অ্যাকাউন্ট খুললে</span>
            </div>
            <span className="text-green-300 font-black text-sm shrink-0">4,000 🪙</span>
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}

/* ─── Game Mode Selection ─────────────────────────────────────────────────────── */

type SetupStep = 'online' | 'friend' | 'count' | 'create-room' | 'join-room';

const PIECE_COLORS = ['#e0221c', '#e3b400', '#1f5fd6', '#1f9e3a'];

/* generate a random 6-char room code */
function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function GameSetupOverlay({
  onConfirm, onClose, userInfo, initialStep = 'online',
}: {
  onConfirm: (config: GameStartConfig) => void;
  onClose: () => void;
  userInfo: HomeHubProps['userInfo'];
  initialStep?: 'online' | 'friend';
}) {
  const [step, setStep]           = useState<SetupStep>(initialStep);
  const [matchType, setMatchType] = useState<GameStartConfig['matchType']>(undefined);
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState(false);
  const [teamMode, setTeamMode]   = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  // offline: allow 2/3/4; online: only 2/4
  const isOffline = matchType === 'offline';

  function goOnlineSub(mt: GameStartConfig['matchType']) {
    setMatchType(mt);
    setStep('count');
  }

  async function pickCount(n: 2 | 3 | 4) {
    const isOnline = matchType === 'quick-match' || matchType === 'nearby' || matchType === 'ranked';
    // টিম মোড শুধু ৪ জনের জন্য
    if (!isOnline && matchType !== 'create-room') {
      onConfirm({ mode: 'classic', playerCount: n, matchType, teamMode: n === 4 ? teamMode : false });
      return;
    }
    if (!userInfo) {
      setServerError('Real player-এর সাথে খেলতে আগে লগইন করুন।');
      return;
    }

    setIsSubmitting(true);
    setServerError('');
    try {
      const response = await fetch(`${basePath}/api/${matchType === 'create-room' ? 'game/rooms' : 'game/matchmaking'}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          matchType === 'create-room'
            ? { mode: n === 2 ? 'quick' : 'classic', isNearby: false }
            : { mode: n === 2 ? 'quick' : 'classic', maxPlayers: n, matchType, isNearby: matchType === 'nearby' },
        ),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.room) {
        throw new Error(payload.error ?? 'Room তৈরি করা যায়নি');
      }
      onConfirm({
        mode: n === 2 ? 'quick' : 'classic',
        playerCount: n,
        matchType,
        online: true,
        roomId: payload.room.id,
        room: payload.room,
      });
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'অনলাইন ম্যাচ শুরু করা যায়নি');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleJoin() {
    if (joinInput.trim().length < 4) { setJoinError(true); return; }
    if (!userInfo) {
      setServerError('Real player-এর সাথে খেলতে আগে লগইন করুন।');
      return;
    }
    setIsSubmitting(true);
    setServerError('');
    try {
      const response = await fetch(`${basePath}/api/game/rooms/${joinInput.trim().toUpperCase()}/join`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.room) {
        throw new Error(payload.error ?? 'Room-এ যোগ দেওয়া যায়নি');
      }
      const maxPlayers = payload.room.maxPlayers === 2 ? 2 : 4;
      onConfirm({
        mode: maxPlayers === 2 ? 'quick' : 'classic',
        playerCount: maxPlayers,
        matchType: 'join-code',
        online: true,
        roomId: payload.room.id,
        room: payload.room,
      });
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Room-এ যোগ দেওয়া যায়নি');
    } finally {
      setIsSubmitting(false);
    }
  }

  const backOf: Partial<Record<SetupStep, SetupStep>> = {
    count: initialStep, 'create-room': 'friend', 'join-room': 'friend',
  };

  const titles: Record<SetupStep, string> = {
    online: '🌐 Online Match',
    friend: '👥 Play with Friends',
    count:  'প্লেয়ার সংখ্যা',
    'create-room': '🏠 Create Room',
    'join-room':   '🔑 Join by Room Code',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        className="w-full max-w-md bg-[#060a1c] border border-white/10 rounded-t-3xl p-6 pb-10"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          {backOf[step] ? (
            <button onClick={() => setStep(backOf[step]!)}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform">
              <ChevronLeft size={18} className="text-white" />
            </button>
          ) : <div className="w-9 h-9" />}
          <h2 className="text-white font-black text-base tracking-wide">{titles[step]}</h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform">
            <X size={18} className="text-white" />
          </button>
        </div>

        <AnimatePresence mode="wait">

          {/* ── ONLINE ── */}
          {step === 'online' && (
            <motion.div key="online" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              className="flex flex-col gap-3">
              <p className="text-white/40 text-[11px] text-center mb-1">একটি ম্যাচ টাইপ বেছে নিন</p>
              {([
                { id: 'quick-match', emoji: '⚡', label: 'Quick Match',  desc: 'দ্রুত একটি অনলাইন ম্যাচ শুরু করুন',   color: 'border-yellow-400/40 from-yellow-600/20 to-orange-900/30'  },
                { id: 'nearby',      emoji: '📍', label: 'Nearby Match', desc: 'কাছের Players-দের সাথে খেলুন',         color: 'border-green-400/40 from-green-600/20 to-emerald-900/30'   },
                { id: 'ranked',      emoji: '🏆', label: 'Ranked Match', desc: 'Rank বাড়াতে Ranked ম্যাচে অংশ নিন',  color: 'border-red-400/40 from-red-600/20 to-rose-900/30'          },
              ] as { id: GameStartConfig['matchType']; emoji: string; label: string; desc: string; color: string }[]).map(opt => (
                <button key={opt.id as string} onClick={() => goOnlineSub(opt.id)}
                  className={`w-full flex items-center gap-4 p-3.5 rounded-2xl border bg-gradient-to-r active:scale-[0.98] transition-all ${opt.color}`}>
                  <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-2xl shrink-0">{opt.emoji}</div>
                  <div className="text-left flex-1">
                    <span className="font-black text-white text-sm block">{opt.label}</span>
                    <span className="text-white/50 text-[10px] font-medium">{opt.desc}</span>
                  </div>
                  <ChevronLeft size={15} className="text-white/30 rotate-180 shrink-0" />
                </button>
              ))}
            </motion.div>
          )}

          {/* ── FRIEND ── */}
          {step === 'friend' && (
            <motion.div key="friend" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              className="flex flex-col gap-3">
              {/* Create Room */}
              <button onClick={() => { setMatchType('create-room'); setStep('create-room'); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-indigo-400/40 bg-gradient-to-r from-indigo-600/20 to-blue-900/30 active:scale-[0.98] transition-all shadow-[0_0_18px_rgba(99,102,241,0.15)]">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-2xl shrink-0">🏠</div>
                <div className="text-left flex-1">
                  <span className="font-black text-white text-sm block">Create Room</span>
                  <span className="text-indigo-200/60 text-[10px] font-medium">রুম তৈরি করুন, কোড শেয়ার করুন</span>
                </div>
                <ChevronLeft size={15} className="text-white/30 rotate-180 shrink-0" />
              </button>

              {/* Join by Room Code */}
              <button onClick={() => { setMatchType('join-code'); setStep('join-room'); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-teal-400/40 bg-gradient-to-r from-teal-600/20 to-cyan-900/30 active:scale-[0.98] transition-all shadow-[0_0_18px_rgba(20,184,166,0.15)]">
                <div className="w-12 h-12 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-2xl shrink-0">🔑</div>
                <div className="text-left flex-1">
                  <span className="font-black text-white text-sm block">Join by Room Code</span>
                  <span className="text-teal-200/60 text-[10px] font-medium">বন্ধুর রুম কোড দিয়ে যোগ দিন</span>
                </div>
                <ChevronLeft size={15} className="text-white/30 rotate-180 shrink-0" />
              </button>

              {/* Play Offline */}
              <button onClick={() => { setMatchType('offline'); setStep('count'); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-orange-400/40 bg-gradient-to-r from-orange-600/20 to-amber-900/30 active:scale-[0.98] transition-all shadow-[0_0_18px_rgba(251,146,60,0.15)]">
                <div className="w-12 h-12 rounded-xl bg-orange-500/20 border border-orange-400/30 flex items-center justify-center text-2xl shrink-0">📱</div>
                <div className="text-left flex-1">
                  <span className="font-black text-white text-sm block">Play Offline</span>
                  <span className="text-orange-200/60 text-[10px] font-medium">এক মোবাইলে ২–৪ জন একসাথে খেলুন</span>
                </div>
                <ChevronLeft size={15} className="text-white/30 rotate-180 shrink-0" />
              </button>
            </motion.div>
          )}

          {/* ── CREATE ROOM ── */}
          {step === 'create-room' && (
            <motion.div key="create-room" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              className="flex flex-col items-center gap-5">
              <div className="w-full rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-5 text-center">
                <span className="text-white/70 text-sm font-bold block mb-2">কতজনের Room তৈরি করবেন?</span>
                <span className="text-white/40 text-[11px]">Room তৈরি হলে server থেকে আসা code-ই শেয়ার করবেন।</span>
              </div>
              <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 flex flex-col items-center gap-2">
                <div className="flex gap-2 items-center">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-white/60 text-xs font-medium">Players-দের জন্য অপেক্ষা করছি...</span>
                </div>
                <div className="flex gap-3 mt-1">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="w-9 h-9 rounded-full bg-white/10 border border-dashed border-white/20 flex items-center justify-center text-white/30 text-lg">?</div>
                  ))}
                </div>
              </div>
              <p className="text-white/30 text-[10px] text-center leading-relaxed">
                বন্ধুরা কোডটি দিয়ে Join করলে<br/>গেম শুরু হয়ে যাবে।
              </p>
              <div className="grid grid-cols-2 gap-3 w-full">
                {[2, 4].map(n => (
                  <button key={n} disabled={isSubmitting} onClick={() => void pickCount(n as 2 | 4)}
                    className="py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-black text-sm active:scale-95 transition-all disabled:opacity-50">
                    {isSubmitting ? 'অপেক্ষা করুন…' : `${n} জনের Room`}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── JOIN BY CODE ── */}
          {step === 'join-room' && (
            <motion.div key="join-room" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              className="flex flex-col gap-5">
              <p className="text-white/40 text-[11px] text-center">বন্ধুর Room Code লিখুন</p>
              <div className="flex gap-2 justify-center">
                <input
                  value={joinInput}
                  onChange={e => { setJoinInput(e.target.value.toUpperCase().slice(0, 6)); setJoinError(false); }}
                  placeholder="XXXXXX"
                  maxLength={6}
                  className={`w-48 text-center text-2xl font-black tracking-[0.3em] py-3 rounded-2xl bg-white/10 border ${joinError ? 'border-red-400' : 'border-white/20'} text-white outline-none focus:border-teal-400 transition-colors placeholder:text-white/20`}
                />
              </div>
              {joinError && <p className="text-red-400 text-[10px] text-center -mt-3">সঠিক কোড লিখুন (কমপক্ষে ৪টি অক্ষর)</p>}
              <button
                onClick={() => void handleJoin()}
                disabled={isSubmitting}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-black text-sm active:scale-95 transition-all shadow-[0_0_18px_rgba(20,184,166,0.4)]"
              >
                {isSubmitting ? 'যোগ হচ্ছে…' : 'Join Room'}
              </button>
              {serverError && <p className="text-red-400 text-[10px] text-center">{serverError}</p>}
            </motion.div>
          )}

          {/* ── PLAYER COUNT ── */}
          {step === 'count' && (
            <motion.div key="count" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              className="flex flex-col gap-4">
              <p className="text-white/40 text-[11px] text-center mb-1">
                {isOffline ? 'এক মোবাইলে কতজন খেলবেন?' : 'কতজন খেলতে চান?'}
              </p>
              <div className={`grid gap-3 ${isOffline ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {(isOffline ? [2, 3, 4] as const : [2, 4] as const).map(n => (
                  <button key={n} disabled={isSubmitting} onClick={() => void pickCount(n)}
                    className="flex flex-col items-center gap-2 py-5 rounded-2xl border border-white/15 bg-white/5 active:scale-95 transition-all hover:bg-white/10">
                    <span className="text-4xl font-black text-white leading-none">{n}</span>
                    <div className="flex gap-1 flex-wrap justify-center">
                      {Array.from({ length: n }).map((_, i) => (
                        <div key={i} className="w-2.5 h-2.5 rounded-full"
                          style={{ background: PIECE_COLORS[i], boxShadow: `0 0 5px ${PIECE_COLORS[i]}99` }} />
                      ))}
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400">
                      {n === 2 ? '২ জন' : n === 3 ? '৩ জন' : '৪ জন'}
                    </span>
                  </button>
                ))}
              </div>
              {/* টিম মোড টগল — শুধু ৪ জন সিলেক্ট করলে কাজ করে */}
              <button
                onClick={() => setTeamMode(v => !v)}
                className="w-full flex items-center justify-between rounded-2xl border px-4 py-3 select-none transition-all active:scale-[0.98]"
                style={{
                  background: teamMode ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                  borderColor: teamMode ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.12)',
                }}
              >
                <div className="flex flex-col items-start gap-0.5">
                  <span className="text-sm font-bold text-white">🤝 টিম মোড</span>
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    লাল &amp; নীল vs হলুদ &amp; সবুজ (৪ জনের জন্য)
                  </span>
                </div>
                <div style={{
                  position: 'relative', flexShrink: 0, width: 44, height: 24,
                  borderRadius: 12, transition: 'background 0.2s',
                  background: teamMode ? '#10b981' : 'rgba(255,255,255,0.18)',
                  boxShadow: teamMode ? '0 0 10px #10b98188' : undefined,
                }}>
                  <motion.div
                    animate={{ x: teamMode ? 22 : 2 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                    style={{ position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
                  />
                </div>
              </button>
              {serverError && <p className="text-red-400 text-[10px] text-center">{serverError}</p>}
              </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/* ─── Main Hub View ───────────────────────────────────────────────────────────── */

function HubView({
  profile, dailyClaimed, onNavigate, onPlusCoins, onPlusCash, onPlayOnline, onPlayFriends, tourneyPhase,
}: {
  profile: Profile;
  dailyClaimed: boolean;
  onNavigate: (k: string) => void;
  onPlusCoins: () => void;
  onPlusCash: () => void;
  onPlayOnline: () => void;
  onPlayFriends: () => void;
  tourneyPhase: string;
}) {
  return (
    <ScreenShell activeNav="home" onNavigate={k => onNavigate(k)}>
      <TopBar
        username={profile.username} level={profile.level}
        coins={profile.coins} cash={profile.cash}
        onPlusCoins={onPlusCoins} onPlusCash={onPlusCash}
        onOpenProfile={() => onNavigate('profile')}
      />

      <div className="flex-1 flex flex-col items-center pt-2 px-4 w-full max-w-md mx-auto">
        {/* Title */}
        <div className="text-center mb-5 relative">
          <h1 className="text-6xl font-black italic tracking-wider text-white leading-none"
            style={{ textShadow: '0 0 20px rgba(96,165,250,0.8), 0 0 40px rgba(96,165,250,0.4)' }}>
            LUDO
          </h1>
          <div className="flex items-center justify-center gap-3 mt-1">
            <div className="h-[2px] w-12 bg-gradient-to-r from-transparent to-cyan-400" />
            <span className="text-xl font-black italic text-cyan-300 uppercase tracking-widest"
              style={{ textShadow: '0 0 12px rgba(103,232,249,0.8)' }}>
              StarBD
            </span>
            <div className="h-[2px] w-12 bg-gradient-to-l from-transparent to-cyan-400" />
          </div>
        </div>

        {/* Rotating board */}
        <div className="relative mb-7 group">
          <div className="absolute inset-0 rounded-3xl opacity-50"
            style={{ background: 'conic-gradient(from 0deg, #f87171, #facc15, #4ade80, #60a5fa, #f87171)', filter: 'blur(20px)' }} />
          <div className="w-40 h-40 rounded-3xl relative z-10 shadow-[0_0_40px_rgba(0,0,0,0.8)] border-2 border-white/10
            grid grid-cols-2 grid-rows-2 overflow-hidden transition-transform duration-700 ease-out group-hover:rotate-[360deg]">
            <div className="bg-red-500" /><div className="bg-green-500" />
            <div className="bg-yellow-400" /><div className="bg-blue-500" />
          </div>
        </div>

        {/* Daily bonus */}
        <button onClick={() => onNavigate('daily')} className="w-full block mb-5">
          <GlassCard gradient="purple" interactive className="w-full p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center border border-purple-400/50"
                style={{ boxShadow: dailyClaimed ? 'none' : '0 0 10px rgba(168,85,247,0.5)' }}>
                <Gift className="text-purple-300" size={20} />
              </div>
              <div className="flex flex-col text-left">
                <span className="font-bold text-white text-sm">{dailyClaimed ? 'Daily Bonus Claimed' : 'Daily Bonus Ready!'}</span>
                <span className="text-xs text-purple-200">{dailyClaimed ? 'কালকে আবার আসুন' : 'Tap to claim your reward'}</span>
              </div>
            </div>
            <ChevronRight className="text-purple-300" size={20} />
          </GlassCard>
        </button>

        {/* PLAY buttons */}
        <div className="w-full grid grid-cols-2 gap-4 mb-5">
          <button onClick={onPlayOnline} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 p-3 border border-blue-400/50 shadow-[0_0_20px_rgba(59,130,246,0.3)] active:scale-95 transition-all flex flex-col items-center justify-center gap-1 h-28 group">
            <span className="text-4xl leading-none transition-transform duration-300 group-hover:scale-125 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]"
              style={{ animation: 'ludoSpin 6s linear infinite', display: 'inline-block' }}>🌍</span>
            <span className="font-black italic text-lg tracking-wide text-white drop-shadow-md leading-none">PLAY</span>
            <span className="text-[10px] text-blue-200/80 font-semibold tracking-wide leading-none">online with real players</span>
          </button>
          <button onClick={onPlayFriends} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-600 to-green-800 p-3 border border-green-400/50 shadow-[0_0_20px_rgba(34,197,94,0.3)] active:scale-95 transition-all flex flex-col items-center justify-center gap-1 h-28 group">
            <Users className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-transform duration-300 group-hover:scale-125"
              style={{ animation: 'ludoFriendBounce 1.6s ease-in-out infinite' }} size={36} strokeWidth={1.5} />
            <span className="font-black italic text-lg tracking-wide text-white drop-shadow-md leading-none">PLAY</span>
            <span className="text-[10px] text-green-200/80 font-semibold tracking-wide leading-none">with friends</span>
          </button>
        </div>

        {/* Tournament Block */}
        <button onClick={() => onNavigate('tournament')} className="w-full mb-5 text-left transition-transform active:scale-95">
          <GlassCard gradient="dark" interactive className="w-full p-4 shadow-[0_0_24px_rgba(250,204,21,0.3)] border-yellow-500/50 relative overflow-hidden group">
            <div className="absolute inset-0 bg-yellow-400/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="text-center relative z-10">
              <Trophy className="text-yellow-400 mx-auto mb-2 transition-transform group-hover:scale-110" size={32} style={{ filter: 'drop-shadow(0 0 18px rgba(250,204,21,1))' }} />
              <h3 className="font-black italic text-2xl tracking-widest text-yellow-400 mb-1" style={{ textShadow: '0 0 14px rgba(250,204,21,0.7)' }}>TOURNAMENT</h3>
              <div className="inline-flex items-center gap-1.5 bg-yellow-400/20 border border-yellow-400/50 rounded-full px-4 py-1">
                <Sparkles size={14} className="text-yellow-300" />
                <span className="text-yellow-100 text-[11px] font-black tracking-widest uppercase">
                  {tourneyPhase === 'none' ? 'JOIN NOW' : tourneyPhase === 'champion' ? 'CHAMPION 🏆' : tourneyPhase === 'eliminated' ? 'ELIMINATED' : 'IN PROGRESS'}
                </span>
              </div>
            </div>
          </GlassCard>
        </button>

        {/* Ranking + Invite */}
        <div className="w-full grid grid-cols-2 gap-4">
          <button onClick={() => onNavigate('ranking')} className="h-14 rounded-xl bg-gradient-to-r from-red-600 to-rose-500 px-3 flex items-center gap-3 border border-red-400/30 shadow-lg active:scale-95 transition-transform">
            <div className="w-9 h-9 shrink-0 bg-white/20 rounded-lg flex items-center justify-center">
              <span className="text-lg leading-none">🥇</span>
            </div>
            <span className="font-bold text-sm text-white italic tracking-wide">RANKING</span>
          </button>
          <button onClick={() => onNavigate('invite')} className="h-14 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-3 flex items-center gap-3 border border-yellow-300/50 shadow-lg active:scale-95 transition-transform">
            <div className="w-9 h-9 shrink-0 bg-black/20 rounded-lg flex items-center justify-center">
              <UserPlus className="text-[#050818]" size={18} />
            </div>
            <span className="font-bold text-sm text-[#050818] italic tracking-wide">INVITE</span>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes ludoSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes ludoFriendBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
      `}</style>
    </ScreenShell>
  );
}

/* ─── HomeHub — main export ──────────────────────────────────────────────────── */

type InternalScreen =
  | 'home' | 'store' | 'deposit' | 'message' | 'chat'
  | 'notifi' | 'settings' | 'profile' | 'ranking' | 'daily' | 'invite' | 'tournament';

export function HomeHub({ userInfo, onStartGame }: HomeHubProps) {
  const { signOut } = useClerk();
  const { isSignedIn } = useUser();
  const [, setLocation] = useLocation();
  const [screen, setScreen] = useState<InternalScreen>('home');
  const [gameSetupMode, setGameSetupMode] = useState<'online' | 'friend' | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // Tournament state preview for home
  const [tourneyPhase, setTourneyPhase] = useState<string>('none');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ludo_tournament');
      if (saved) {
        const state = JSON.parse(saved);
        if (state.phase) setTourneyPhase(state.phase);
      }
    } catch {}
  }, [screen]); // refresh when returning to home

  // Profile state (persisted)
  const [profile, setProfile] = useState<Profile>(() => loadProfile(userInfo));
  useEffect(() => {
    localStorage.setItem('ludo_profile', JSON.stringify(profile));
  }, [profile]);

  // Streak state
  const [streak, setStreak] = useState<{ day: number; claimedToday: boolean }>({ day: 1, claimedToday: false });

  // Chats state
  const [chats, setChats] = useState(DEMO_CHATS);

  // Nav helper — type guard
  function navigate(k: string) {
    setScreen(k as InternalScreen);
  }

  function handleBuyCoins(amount: number, price: number) {
    setProfile(p => ({ ...p, coins: p.coins + amount, cash: p.cash - price }));
  }

  function handleDeposit(amount: number) {
    setProfile(p => ({ ...p, cash: p.cash + amount }));
  }

  function handleClaimDaily() {
    if (streak.claimedToday) return;
    const amount = DAILY_BONUS[streak.day - 1];
    setProfile(p => ({ ...p, coins: p.coins + amount }));
    setStreak(s => ({ ...s, claimedToday: true }));
  }

  function openChat(id: string) {
    setChats(cs => cs.map(c => c.id === id ? { ...c, unread: 0 } : c));
    setActiveChatId(id);
    setScreen('chat');
  }

  function sendMessage(text: string) {
    if (!activeChatId) return;
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    setChats(cs => cs.map(c => c.id === activeChatId ? { ...c, messages: [...c.messages, { from: 'me', text, time }] } : c));
  }

  async function handleSignOut() {
    localStorage.removeItem('ludo_guest_mode');
    localStorage.removeItem('ludo_profile');
    await signOut();
  }

  // Bottom-nav tab → screen mapping
  function handleBottomNav(k: NavKey) {
    navigate(k);
  }

  // Render the active screen
  if (screen === 'store')    return <StoreScreen profile={profile} onNavigate={navigate} onBuy={handleBuyCoins} />;
  if (screen === 'deposit')  return <DepositScreen profile={profile} onNavigate={navigate} onDeposit={handleDeposit} />;
  if (screen === 'notifi')   return <NotificationsScreen onNavigate={navigate} />;
  if (screen === 'settings') return <SettingsScreen profile={profile} onNavigate={navigate} onSignOut={handleSignOut} />;
  if (screen === 'profile')  return <ProfileScreen profile={profile} onNavigate={navigate} />;
  if (screen === 'ranking')  return <RankingScreen onNavigate={navigate} />;
  if (screen === 'daily')    return <DailyBonusScreen profile={profile} streak={streak} onClaim={handleClaimDaily} onNavigate={navigate} />;
  if (screen === 'invite')   return <InviteScreen onNavigate={navigate} />;
  if (screen === 'message')  return <MessageScreen chats={chats} onOpenChat={openChat} onNavigate={navigate} />;
  if (screen === 'chat') {
    const chat = chats.find(c => c.id === activeChatId);
    if (chat) return <ChatScreen chat={chat} onSend={sendMessage} onBack={() => setScreen('message')} />;
  }
  if (screen === 'tournament') return <TournamentScreen onNavigate={navigate} userInfo={userInfo} />;

  // Default: home hub
  return (
    <>
      <HubView
        profile={profile}
        dailyClaimed={streak.claimedToday}
        onNavigate={navigate}
        onPlusCoins={() => {
          if (!isSignedIn) { setLocation(`${basePath}/sign-in`); return; }
          setScreen('store');
        }}
        onPlusCash={() => {
          if (!isSignedIn) { setLocation(`${basePath}/sign-in`); return; }
          setScreen('deposit');
        }}
        onPlayOnline={() => setGameSetupMode('online')}
        onPlayFriends={() => setGameSetupMode('friend')}
        tourneyPhase={tourneyPhase}
      />

      <AnimatePresence>
        {gameSetupMode && (
          <GameSetupOverlay
            initialStep={gameSetupMode}
            userInfo={userInfo}
            onConfirm={config => {
              setGameSetupMode(null);
              onStartGame(config);
            }}
            onClose={() => setGameSetupMode(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
