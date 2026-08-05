import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, ChevronLeft, ChevronRight, Plus, Minus } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function fetchPlayers(search: string, offset: number) {
  const params = new URLSearchParams({ limit: '20', offset: String(offset) });
  if (search) params.set('search', search);
  const res = await fetch(`${BASE}/api/admin/players?${params}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

interface AdjustModal {
  uid: string;
  name: string;
  coins: number;
  cash: number;
}

export function AdminPlayers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [modal, setModal] = useState<AdjustModal | null>(null);
  const [adjType, setAdjType] = useState<'coins' | 'cash'>('coins');
  const [adjDelta, setAdjDelta] = useState('');
  const [adjNote, setAdjNote] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-players', debouncedSearch, offset],
    queryFn: () => fetchPlayers(debouncedSearch, offset),
  });

  const adjustMutation = useMutation({
    mutationFn: async ({ uid, type, delta, note }: { uid: string; type: string; delta: number; note: string }) => {
      const res = await fetch(`${BASE}/api/admin/players/${uid}/adjust`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, delta, note }),
      });
      if (!res.ok) throw new Error('Failed to adjust');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-players'] });
      setModal(null);
      setAdjDelta('');
      setAdjNote('');
    },
  });

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout((window as any)._adminSearchTimer);
    (window as any)._adminSearchTimer = setTimeout(() => {
      setDebouncedSearch(v);
      setOffset(0);
    }, 350);
  };

  const players = data?.players ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      {/* search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="নাম বা ID খুঁজুন…"
            className="w-full pl-9 pr-3 py-2 rounded-xl text-sm text-white placeholder-white/25 outline-none"
            style={{ background: '#1a1a22', border: '1px solid rgba(255,255,255,0.1)' }}
          />
        </div>
        <span className="text-white/30 text-xs">মোট {total} জন</span>
      </div>

      {/* table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#1a1a22', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['নাম', 'Coins', 'Cash (BDT)', 'XP', 'Level', 'যোগ দিয়েছে', 'অ্যাকশন'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-white/40 font-medium text-xs whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-3 rounded animate-pulse w-20" style={{ background: '#2a2a35' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : players.map((p: any) => (
                    <tr
                      key={p.id}
                      className="hover:bg-white/2 transition-colors"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {p.avatarUrl && <img src={p.avatarUrl} className="w-7 h-7 rounded-full object-cover" />}
                          <div>
                            <p className="text-white font-medium">{p.displayName}</p>
                            <p className="text-white/30 text-xs">{p.clerkUserId.slice(0, 14)}…</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-yellow-400 font-mono">{Number(p.coins).toLocaleString()}</td>
                      <td className="px-4 py-3 text-green-400 font-mono">৳ {Number(p.cash).toFixed(2)}</td>
                      <td className="px-4 py-3 text-white/60">{p.xp}</td>
                      <td className="px-4 py-3 text-white/60">{p.level}</td>
                      <td className="px-4 py-3 text-white/30 text-xs whitespace-nowrap">
                        {new Date(p.createdAt).toLocaleDateString('bn-BD')}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setModal({ uid: p.clerkUserId, name: p.displayName, coins: Number(p.coins), cash: Number(p.cash) })}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/70 hover:text-white transition-all"
                          style={{ background: 'rgba(255,255,255,0.07)' }}
                        >
                          ব্যালেন্স
                        </button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* pagination */}
      <div className="flex items-center justify-end gap-2">
        <button
          disabled={offset === 0}
          onClick={() => setOffset((o) => Math.max(0, o - 20))}
          className="p-2 rounded-lg disabled:opacity-30 hover:bg-white/8 transition-all"
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <span className="text-white/30 text-xs">{Math.floor(offset / 20) + 1} / {Math.max(1, Math.ceil(total / 20))}</span>
        <button
          disabled={offset + 20 >= total}
          onClick={() => setOffset((o) => o + 20)}
          className="p-2 rounded-lg disabled:opacity-30 hover:bg-white/8 transition-all"
        >
          <ChevronRight className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Adjust modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4" style={{ background: '#1e1e2a', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div>
              <h3 className="text-white font-bold">ব্যালেন্স অ্যাডজাস্ট</h3>
              <p className="text-white/40 text-sm mt-0.5">{modal.name}</p>
              <p className="text-white/30 text-xs mt-1">কয়েন: {modal.coins.toLocaleString()} · Cash: ৳{modal.cash.toFixed(2)}</p>
            </div>

            <div className="flex gap-2">
              {(['coins', 'cash'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setAdjType(t)}
                  className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: adjType === t ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.06)',
                    color: adjType === t ? '#f87171' : 'rgba(255,255,255,0.5)',
                    border: `1px solid ${adjType === t ? 'rgba(220,38,38,0.4)' : 'transparent'}`,
                  }}
                >
                  {t === 'coins' ? '🪙 Coins' : '💵 Cash'}
                </button>
              ))}
            </div>

            <div>
              <label className="text-xs text-white/40 mb-1 block">পরিমাণ (ঋণাত্মক = কাটা)</label>
              <input
                type="number"
                value={adjDelta}
                onChange={(e) => setAdjDelta(e.target.value)}
                placeholder="যেমন: 500 বা -200"
                className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                style={{ background: '#2a2a35', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">কারণ</label>
              <input
                value={adjNote}
                onChange={(e) => setAdjNote(e.target.value)}
                placeholder="যেমন: Tournament prize"
                className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                style={{ background: '#2a2a35', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setModal(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white transition-all"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                বাতিল
              </button>
              <button
                onClick={() =>
                  adjustMutation.mutate({
                    uid: modal.uid,
                    type: adjType,
                    delta: Number(adjDelta),
                    note: adjNote || 'Admin adjustment',
                  })
                }
                disabled={!adjDelta || Number(adjDelta) === 0 || adjustMutation.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
                style={{ background: 'rgb(220,38,38)' }}
              >
                {adjustMutation.isPending ? 'সেভ করছে…' : 'সেভ করুন'}
              </button>
            </div>
            {adjustMutation.isError && (
              <p className="text-red-400 text-xs text-center">{String(adjustMutation.error)}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
