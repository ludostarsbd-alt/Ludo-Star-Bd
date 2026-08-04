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
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClerk } from '@clerk/react';

/* ─── Public types ─────────────────────────────────────────────────────────── */

export interface GameStartConfig {
  mode: 'classic' | 'quick';
  playerCount: 2 | 4;
  matchType?: 'quick-match' | 'nearby' | 'ranked' | 'create-room' | 'invite' | 'join-code';
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

  return (
    <ScreenShell activeNav="settings" onNavigate={k => onNavigate(k)}>
      <ScreenHeader title="Settings" onBack={() => onNavigate('home')} />
      <div className="px-4 w-full max-w-md mx-auto flex-1 flex flex-col gap-4 pb-4">
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

        <div>
          <p className="text-white/50 text-[11px] mb-2">প্রেফারেন্স</p>
          <div className="flex flex-col gap-2">
            {([
              { icon: Volume2, label: 'সাউন্ড ইফেক্ট', val: sound, set: setSound },
              { icon: Music,   label: 'মিউজিক',        val: music, set: setMusic },
              { icon: Vibrate, label: 'ভাইব্রেশন',     val: vibration, set: setVibration },
            ] as const).map(({ icon: Icon, label, val, set }) => (
              <button key={label} className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/10 text-cyan-300"><Icon size={16} /></div>
                <span className="flex-1 text-left text-xs font-bold text-white">{label}</span>
                <Toggle checked={val} onChange={set} />
              </button>
            ))}
            <button className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/10 text-cyan-300"><Globe2 size={16} /></div>
              <span className="flex-1 text-left text-xs font-bold text-white">ভাষা</span>
              <span className="text-white/50 text-[11px]">বাংলা</span>
            </button>
          </div>
        </div>

        <div>
          <p className="text-white/50 text-[11px] mb-2">সাপোর্ট</p>
          <div className="flex flex-col gap-2">
            <button className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/10 text-cyan-300"><HelpCircle size={16} /></div>
              <span className="flex-1 text-left text-xs font-bold text-white">হেল্প সেন্টার</span>
              <ChevronRight size={16} className="text-white/30" />
            </button>
            <button className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/10 text-cyan-300"><ShieldCheck size={16} /></div>
              <span className="flex-1 text-left text-xs font-bold text-white">Terms & Privacy</span>
              <ChevronRight size={16} className="text-white/30" />
            </button>
          </div>
        </div>

        <button onClick={onSignOut} className="flex items-center gap-3 rounded-xl bg-red-500/10 border border-red-400/30 p-3 active:scale-[0.98] transition-transform">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-500/20 text-red-300"><LogOut size={16} /></div>
          <span className="flex-1 text-left text-xs font-bold text-red-300">লগ আউট</span>
        </button>
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

type SetupStep = 'main' | 'online' | 'friend' | 'count';

const PIECE_COLORS = ['#e0221c', '#e3b400', '#1f5fd6', '#1f9e3a'];

function GameSetupOverlay({
  onConfirm, onClose,
}: {
  onConfirm: (config: GameStartConfig) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<SetupStep>('main');
  const [matchType, setMatchType] = useState<GameStartConfig['matchType']>(undefined);

  function goOnlineSub(mt: GameStartConfig['matchType']) {
    setMatchType(mt);
    setStep('count');
  }

  function goFriendSub(mt: GameStartConfig['matchType']) {
    setMatchType(mt);
    setStep('count');
  }

  function pickCount(n: 2 | 4) {
    // Online = quick mode (power-six on), Friend = classic
    const mode: GameStartConfig['mode'] =
      step === 'count' && (matchType === 'quick-match' || matchType === 'nearby' || matchType === 'ranked')
        ? 'quick'
        : 'classic';
    onConfirm({ mode, playerCount: n, matchType });
  }

  const backStep: Record<SetupStep, SetupStep | null> = {
    main: null, online: 'main', friend: 'main', count: 'main',
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
          {backStep[step] !== null ? (
            <button
              onClick={() => setStep(backStep[step]!)}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
            >
              <ChevronLeft size={18} className="text-white" />
            </button>
          ) : <div className="w-9 h-9" />}
          <h2 className="text-white font-black text-base tracking-wide">
            {step === 'main'  && 'গেম মোড বেছে নিন'}
            {step === 'online' && '🌐 Online Match'}
            {step === 'friend' && '👥 Friend Match'}
            {step === 'count'  && 'প্লেয়ার সংখ্যা'}
          </h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform">
            <X size={18} className="text-white" />
          </button>
        </div>

        <AnimatePresence mode="wait">

          {/* ── MAIN: two big cards ── */}
          {step === 'main' && (
            <motion.div key="main" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              className="flex flex-col gap-3">
              {/* Online Match */}
              <button
                onClick={() => setStep('online')}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-cyan-400/40 bg-gradient-to-r from-cyan-600/20 to-blue-900/30 active:scale-[0.98] transition-all shadow-[0_0_24px_rgba(34,211,238,0.15)]"
              >
                <div className="w-14 h-14 rounded-2xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center text-3xl shrink-0">
                  🌐
                </div>
                <div className="text-left flex-1">
                  <span className="font-black text-white text-base block leading-tight">Online Match</span>
                  <span className="text-cyan-300/70 text-[11px] font-semibold mt-0.5 block leading-snug">
                    সারা বিশ্বের Player-এর সাথে Match করুন
                  </span>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {['Quick', 'Nearby', 'Ranked'].map(t => (
                      <span key={t} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-cyan-400/15 text-cyan-300 border border-cyan-400/25">{t}</span>
                    ))}
                  </div>
                </div>
                <ChevronLeft size={16} className="text-white/40 rotate-180 shrink-0" />
              </button>

              {/* Friend Match */}
              <button
                onClick={() => setStep('friend')}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-purple-400/40 bg-gradient-to-r from-purple-600/20 to-indigo-900/30 active:scale-[0.98] transition-all shadow-[0_0_24px_rgba(168,85,247,0.15)]"
              >
                <div className="w-14 h-14 rounded-2xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-3xl shrink-0">
                  👥
                </div>
                <div className="text-left flex-1">
                  <span className="font-black text-white text-base block leading-tight">Friend Match</span>
                  <span className="text-purple-300/70 text-[11px] font-semibold mt-0.5 block leading-snug">
                    বন্ধুদের সাথে প্রাইভেট রুমে খেলুন
                  </span>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {['Create Room', 'Invite', 'Join Code'].map(t => (
                      <span key={t} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-purple-400/15 text-purple-300 border border-purple-400/25">{t}</span>
                    ))}
                  </div>
                </div>
                <ChevronLeft size={16} className="text-white/40 rotate-180 shrink-0" />
              </button>
            </motion.div>
          )}

          {/* ── ONLINE sub-options ── */}
          {step === 'online' && (
            <motion.div key="online" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              className="flex flex-col gap-3">
              <p className="text-white/40 text-[11px] text-center mb-1">একটি ম্যাচ টাইপ বেছে নিন</p>
              {[
                { id: 'quick-match' as const, emoji: '⚡', label: 'Quick Match',  desc: 'দ্রুত একটি অনলাইন ম্যাচ শুরু করুন',           color: 'border-yellow-400/40 from-yellow-600/20 to-orange-900/30 shadow-[0_0_18px_rgba(234,179,8,0.15)]',   tag: 'yellow' },
                { id: 'nearby'      as const, emoji: '📍', label: 'Nearby Match',  desc: 'কাছের Players-দের সাথে খেলুন',                color: 'border-green-400/40 from-green-600/20 to-emerald-900/30 shadow-[0_0_18px_rgba(34,197,94,0.15)]',   tag: 'green'  },
                { id: 'ranked'      as const, emoji: '🏆', label: 'Ranked Match',  desc: 'Rank বাড়াতে Ranked ম্যাচে অংশ নিন',         color: 'border-red-400/40 from-red-600/20 to-rose-900/30 shadow-[0_0_18px_rgba(239,68,68,0.15)]',          tag: 'red'    },
              ].map(opt => (
                <button key={opt.id} onClick={() => goOnlineSub(opt.id)}
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

          {/* ── FRIEND sub-options ── */}
          {step === 'friend' && (
            <motion.div key="friend" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              className="flex flex-col gap-3">
              <p className="text-white/40 text-[11px] text-center mb-1">একটি অপশন বেছে নিন</p>
              {[
                { id: 'create-room' as const, emoji: '🏠', label: 'Create Room',    desc: 'নতুন রুম তৈরি করুন ও বন্ধুদের আমন্ত্রণ জানান', color: 'border-indigo-400/40 from-indigo-600/20 to-blue-900/30 shadow-[0_0_18px_rgba(99,102,241,0.15)]'  },
                { id: 'invite'      as const, emoji: '📨', label: 'Invite Friends', desc: 'বন্ধুদের সরাসরি Invite পাঠান',                   color: 'border-pink-400/40 from-pink-600/20 to-rose-900/30 shadow-[0_0_18px_rgba(236,72,153,0.15)]'     },
                { id: 'join-code'   as const, emoji: '🔑', label: 'Join by Room Code', desc: 'Room Code দিয়ে বন্ধুর রুমে যোগ দিন',         color: 'border-teal-400/40 from-teal-600/20 to-cyan-900/30 shadow-[0_0_18px_rgba(20,184,166,0.15)]'      },
              ].map(opt => (
                <button key={opt.id} onClick={() => goFriendSub(opt.id)}
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

          {/* ── PLAYER COUNT ── */}
          {step === 'count' && (
            <motion.div key="count" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              className="flex flex-col gap-4">
              <p className="text-white/40 text-[11px] text-center mb-1">কতজন খেলতে চান?</p>
              <div className="grid grid-cols-2 gap-4">
                {([2, 4] as const).map(n => (
                  <button key={n} onClick={() => pickCount(n)}
                    className="flex flex-col items-center gap-3 py-6 rounded-2xl border border-white/15 bg-white/5 active:scale-95 transition-all hover:bg-white/10">
                    <span className="text-5xl font-black text-white leading-none">{n}</span>
                    <div className="flex gap-1.5">
                      {Array.from({ length: n }).map((_, i) => (
                        <div key={i} className="w-3 h-3 rounded-full"
                          style={{ background: PIECE_COLORS[i], boxShadow: `0 0 6px ${PIECE_COLORS[i]}99` }} />
                      ))}
                    </div>
                    <span className="text-xs font-semibold text-slate-400">{n === 2 ? '২ জন' : '৪ জন'}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/* ─── Main Hub View ───────────────────────────────────────────────────────────── */

function HubView({
  profile, dailyClaimed, onNavigate, onPlusCoins, onPlusCash, onPlay,
}: {
  profile: Profile;
  dailyClaimed: boolean;
  onNavigate: (k: string) => void;
  onPlusCoins: () => void;
  onPlusCash: () => void;
  onPlay: () => void;
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
          <button onClick={onPlay} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 p-3 border border-blue-400/50 shadow-[0_0_20px_rgba(59,130,246,0.3)] active:scale-95 transition-all flex flex-col items-center justify-center gap-1 h-28 group">
            <span className="text-4xl leading-none transition-transform duration-300 group-hover:scale-125 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]"
              style={{ animation: 'ludoSpin 6s linear infinite', display: 'inline-block' }}>🌍</span>
            <span className="font-black italic text-lg tracking-wide text-white drop-shadow-md leading-none">PLAY</span>
            <span className="text-[10px] text-blue-200/80 font-semibold tracking-wide leading-none">online with real players</span>
          </button>
          <button onClick={onPlay} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-600 to-green-800 p-3 border border-green-400/50 shadow-[0_0_20px_rgba(34,197,94,0.3)] active:scale-95 transition-all flex flex-col items-center justify-center gap-1 h-28 group">
            <Users className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-transform duration-300 group-hover:scale-125"
              style={{ animation: 'ludoFriendBounce 1.6s ease-in-out infinite' }} size={36} strokeWidth={1.5} />
            <span className="font-black italic text-lg tracking-wide text-white drop-shadow-md leading-none">PLAY</span>
            <span className="text-[10px] text-green-200/80 font-semibold tracking-wide leading-none">with friends</span>
          </button>
        </div>

        {/* Tournament — Coming Soon */}
        <div className="w-full mb-5">
          <GlassCard gradient="dark" className="w-full p-4 shadow-[0_0_24px_rgba(250,204,21,0.2)]">
            <div className="text-center">
              <Trophy className="text-yellow-400 mx-auto mb-2" size={32} style={{ filter: 'drop-shadow(0 0 18px rgba(250,204,21,1))' }} />
              <h3 className="font-black italic text-2xl tracking-widest text-yellow-400 mb-1"
                style={{ textShadow: '0 0 14px rgba(250,204,21,0.7)' }}>TOURNAMENT</h3>
              <div className="inline-flex items-center gap-1.5 bg-yellow-400/10 border border-yellow-400/30 rounded-full px-3 py-1">
                <Sparkles size={12} className="text-yellow-300" />
                <span className="text-yellow-200 text-[10px] font-bold tracking-widest">COMING SOON</span>
              </div>
            </div>
          </GlassCard>
        </div>

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
  | 'notifi' | 'settings' | 'profile' | 'ranking' | 'daily' | 'invite';

export function HomeHub({ userInfo, onStartGame }: HomeHubProps) {
  const { signOut } = useClerk();
  const [screen, setScreen] = useState<InternalScreen>('home');
  const [showGameSetup, setShowGameSetup] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

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

  // Default: home hub
  return (
    <>
      <HubView
        profile={profile}
        dailyClaimed={streak.claimedToday}
        onNavigate={navigate}
        onPlusCoins={() => setScreen('store')}
        onPlusCash={() => setScreen('deposit')}
        onPlay={() => setShowGameSetup(true)}
      />

      <AnimatePresence>
        {showGameSetup && (
          <GameSetupOverlay
            onConfirm={config => {
              setShowGameSetup(false);
              onStartGame(config);
            }}
            onClose={() => setShowGameSetup(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
