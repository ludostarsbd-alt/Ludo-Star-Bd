import { useState } from 'react';
import { useUser } from '@clerk/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, Receipt, CreditCard,
  Gamepad2, Trophy, ChevronLeft, Menu, X, Banknote,
  Settings,
} from 'lucide-react';
import { AdminDashboard } from './sections/AdminDashboard';
import { AdminPlayers } from './sections/AdminPlayers';
import { AdminTransactions } from './sections/AdminTransactions';
import { AdminPaymentOrders } from './sections/AdminPaymentOrders';
import { AdminGameRooms } from './sections/AdminGameRooms';
import { AdminTournaments } from './sections/AdminTournaments';
import { AdminDepositRequests } from './sections/AdminDepositRequests';
import { AdminPaymentSettings } from './sections/AdminPaymentSettings';

type Section =
  | 'dashboard'
  | 'players'
  | 'transactions'
  | 'deposit-requests'
  | 'payment-orders'
  | 'game-rooms'
  | 'tournaments'
  | 'payment-settings';

const NAV: { id: Section; label: string; Icon: React.ElementType; badge?: string }[] = [
  { id: 'dashboard',        label: 'ড্যাশবোর্ড',       Icon: LayoutDashboard },
  { id: 'players',          label: 'প্লেয়ার',          Icon: Users },
  { id: 'deposit-requests', label: 'ডিপোজিট রিকোয়েস্ট', Icon: Banknote },
  { id: 'transactions',     label: 'ট্রান্সেকশন',      Icon: Receipt },
  { id: 'payment-orders',   label: 'পেমেন্ট অর্ডার',   Icon: CreditCard },
  { id: 'game-rooms',       label: 'গেম রুম',           Icon: Gamepad2 },
  { id: 'tournaments',      label: 'টুর্নামেন্ট',      Icon: Trophy },
  { id: 'payment-settings', label: 'পেমেন্ট সেটিংস',   Icon: Settings },
];

interface Props {
  onBack: () => void;
}

export function AdminPanel({ onBack }: Props) {
  const { user } = useUser();
  const [section, setSection] = useState<Section>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const current = NAV.find((n) => n.id === section)!;

  return (
    <div
      className="min-h-[100dvh] flex"
      style={{ background: 'transparent', fontFamily: "'Outfit', sans-serif" }}
    >
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            key="sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 220, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="flex-shrink-0 flex flex-col overflow-hidden"
            style={{ background: '#16161e', borderRight: '1px solid rgba(255,255,255,0.07)' }}
          >
            {/* logo row */}
            <div className="flex items-center gap-2 px-5 py-5 border-b border-white/5">
              <div className="w-7 h-7 rounded-lg bg-red-600 flex items-center justify-center text-xs font-black text-white">A</div>
              <span className="font-bold text-white text-sm tracking-wide">Admin Panel</span>
            </div>

            {/* nav */}
            <nav className="flex-1 py-3 flex flex-col gap-0.5 px-2 overflow-y-auto">
              {NAV.map(({ id, label, Icon }) => {
                const active = section === id;
                return (
                  <button
                    key={id}
                    onClick={() => setSection(id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left"
                    style={{
                      background: active ? 'rgba(220,38,38,0.18)' : 'transparent',
                      color: active ? '#f87171' : 'rgba(255,255,255,0.55)',
                    }}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="whitespace-nowrap">{label}</span>
                  </button>
                );
              })}
            </nav>

            {/* user row */}
            <div className="px-3 py-3 border-t border-white/5 flex items-center gap-2">
              {user?.imageUrl && (
                <img src={user.imageUrl} className="w-7 h-7 rounded-full object-cover" />
              )}
              <span className="text-xs text-white/40 truncate flex-1">
                {user?.primaryEmailAddress?.emailAddress}
              </span>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Main ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* topbar */}
        <header
          className="flex items-center gap-3 px-4 py-3 border-b border-white/5"
          style={{ background: '#16161e' }}
        >
          <button
            onClick={() => setSidebarOpen((p) => !p)}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-all"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <span className="font-semibold text-white text-sm">{current.label}</span>

          <div className="ml-auto">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-all px-3 py-1.5 rounded-lg hover:bg-white/8"
            >
              <ChevronLeft className="w-4 h-4" />
              গেমে ফিরুন
            </button>
          </div>
        </header>

        {/* content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {section === 'dashboard'        && <AdminDashboard />}
              {section === 'players'          && <AdminPlayers />}
              {section === 'deposit-requests' && <AdminDepositRequests />}
              {section === 'transactions'     && <AdminTransactions />}
              {section === 'payment-orders'   && <AdminPaymentOrders />}
              {section === 'game-rooms'       && <AdminGameRooms />}
              {section === 'tournaments'      && <AdminTournaments />}
              {section === 'payment-settings' && <AdminPaymentSettings />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
