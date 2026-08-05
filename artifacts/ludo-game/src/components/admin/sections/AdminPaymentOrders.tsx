import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const STATUSES = ['', 'pending', 'completed', 'failed', 'expired'];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending:   { bg: 'rgba(251,191,36,0.15)',  text: '#fbbf24' },
  completed: { bg: 'rgba(52,211,153,0.15)',  text: '#34d399' },
  failed:    { bg: 'rgba(248,113,113,0.15)', text: '#f87171' },
  expired:   { bg: 'rgba(148,163,184,0.1)',  text: '#94a3b8' },
};

async function fetchOrders(status: string, offset: number) {
  const params = new URLSearchParams({ limit: '20', offset: String(offset) });
  if (status) params.set('status', status);
  const res = await fetch(`${BASE}/api/admin/payment-orders?${params}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

export function AdminPaymentOrders() {
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orders', status, offset],
    queryFn: () => fetchOrders(status, offset),
  });

  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => { setStatus(s); setOffset(0); }}
            className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
            style={{
              background: status === s ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.06)',
              color: status === s ? '#f87171' : 'rgba(255,255,255,0.45)',
              border: `1px solid ${status === s ? 'rgba(220,38,38,0.4)' : 'transparent'}`,
            }}
          >
            {s || 'সব'}
          </button>
        ))}
        <span className="ml-auto text-white/30 text-xs">মোট {total}</span>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#1a1a22', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Order ID', 'প্লেয়ার', 'Gateway', 'টাইপ', 'পরিমাণ', 'Coins', 'স্ট্যাটাস', 'তারিখ'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-white/40 font-medium text-xs whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-3 rounded animate-pulse w-16" style={{ background: '#2a2a35' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : orders.map((o: any) => {
                    const sc = STATUS_COLORS[o.status] ?? STATUS_COLORS['expired'];
                    return (
                      <tr key={o.orderId} className="hover:bg-white/2 transition-colors" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="px-4 py-3 font-mono text-xs text-white/60">{o.orderId}</td>
                        <td className="px-4 py-3 text-white/70 text-xs">{o.displayName ?? o.clerkUserId.slice(0, 10) + '…'}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-blue-500/10 text-blue-400">{o.gateway}</span>
                        </td>
                        <td className="px-4 py-3 text-white/50 text-xs">{o.orderType}</td>
                        <td className="px-4 py-3 text-green-400 font-mono text-xs">৳ {Number(o.amountBDT).toFixed(2)}</td>
                        <td className="px-4 py-3 text-yellow-400 font-mono text-xs">
                          {o.expectedCoins ? Number(o.expectedCoins).toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-md text-xs font-medium" style={{ background: sc.bg, color: sc.text }}>
                            {o.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white/30 text-xs whitespace-nowrap">
                          {new Date(o.createdAt).toLocaleString('bn-BD')}
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
