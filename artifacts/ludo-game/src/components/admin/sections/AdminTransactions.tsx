import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const TX_TYPES = ['', 'deposit', 'coin_purchase', 'game_entry_fee', 'game_winnings', 'daily_bonus', 'admin_credit', 'admin_debit', 'refund'];

const TYPE_COLORS: Record<string, string> = {
  deposit: '#34d399',
  coin_purchase: '#60a5fa',
  game_winnings: '#fbbf24',
  daily_bonus: '#a78bfa',
  admin_credit: '#f472b6',
  admin_debit: '#f87171',
  game_entry_fee: '#fb923c',
  refund: '#94a3b8',
};

async function fetchTxs(type: string, offset: number) {
  const params = new URLSearchParams({ limit: '20', offset: String(offset) });
  if (type) params.set('type', type);
  const res = await fetch(`${BASE}/api/admin/transactions?${params}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

export function AdminTransactions() {
  const [type, setType] = useState('');
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-txs', type, offset],
    queryFn: () => fetchTxs(type, offset),
  });

  const txs = data?.transactions ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {TX_TYPES.map((t) => (
          <button
            key={t || 'all'}
            onClick={() => { setType(t); setOffset(0); }}
            className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
            style={{
              background: type === t ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.06)',
              color: type === t ? '#f87171' : 'rgba(255,255,255,0.45)',
              border: `1px solid ${type === t ? 'rgba(220,38,38,0.4)' : 'transparent'}`,
            }}
          >
            {t || 'সব'}
          </button>
        ))}
        <span className="ml-auto text-white/30 text-xs">মোট {total}</span>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#1a1a22', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['টাইপ', 'Coins Δ', 'Cash Δ', 'পরে Coins', 'পরে Cash', 'নোট', 'তারিখ'].map((h) => (
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
                          <div className="h-3 rounded animate-pulse w-16" style={{ background: '#2a2a35' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : txs.map((tx: any) => {
                    const coins = Number(tx.coinsDelta);
                    const cash = Number(tx.cashDelta);
                    return (
                      <tr key={tx.id} className="hover:bg-white/2 transition-colors" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="px-4 py-3">
                          <span
                            className="px-2 py-0.5 rounded-md text-xs font-medium"
                            style={{ background: `${TYPE_COLORS[tx.type] ?? '#94a3b8'}22`, color: TYPE_COLORS[tx.type] ?? '#94a3b8' }}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td className={`px-4 py-3 font-mono text-xs ${coins > 0 ? 'text-green-400' : coins < 0 ? 'text-red-400' : 'text-white/30'}`}>
                          {coins > 0 ? '+' : ''}{coins.toLocaleString()}
                        </td>
                        <td className={`px-4 py-3 font-mono text-xs ${cash > 0 ? 'text-green-400' : cash < 0 ? 'text-red-400' : 'text-white/30'}`}>
                          {cash !== 0 ? `৳ ${cash > 0 ? '+' : ''}${cash.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-white/50 font-mono text-xs">{Number(tx.coinsAfter).toLocaleString()}</td>
                        <td className="px-4 py-3 text-white/50 font-mono text-xs">৳ {Number(tx.cashAfter).toFixed(2)}</td>
                        <td className="px-4 py-3 text-white/30 text-xs max-w-[160px] truncate">{tx.note || '—'}</td>
                        <td className="px-4 py-3 text-white/30 text-xs whitespace-nowrap">
                          {new Date(tx.createdAt).toLocaleString('bn-BD')}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 20))} className="p-2 rounded-lg disabled:opacity-30 hover:bg-white/8 transition-all">
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <span className="text-white/30 text-xs">{Math.floor(offset / 20) + 1} / {Math.max(1, Math.ceil(total / 20))}</span>
        <button disabled={offset + 20 >= total} onClick={() => setOffset((o) => o + 20)} className="p-2 rounded-lg disabled:opacity-30 hover:bg-white/8 transition-all">
          <ChevronRight className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  );
}
