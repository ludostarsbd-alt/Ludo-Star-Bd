import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  waiting:     { bg: 'rgba(251,191,36,0.15)',  text: '#fbbf24' },
  in_progress: { bg: 'rgba(52,211,153,0.15)',  text: '#34d399' },
  finished:    { bg: 'rgba(148,163,184,0.1)',  text: '#94a3b8' },
  cancelled:   { bg: 'rgba(248,113,113,0.15)', text: '#f87171' },
};

async function fetchRooms(offset: number) {
  const params = new URLSearchParams({ limit: '20', offset: String(offset) });
  const res = await fetch(`${BASE}/api/admin/game-rooms?${params}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

export function AdminGameRooms() {
  const [offset, setOffset] = useState(0);
  const { data, isLoading } = useQuery({ queryKey: ['admin-rooms', offset], queryFn: () => fetchRooms(offset) });

  const rooms = data?.rooms ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white/60 text-sm">মোট রুম: {total}</h3>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#1a1a22', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['কোড', 'মোড', 'প্লেয়ার', 'Entry', 'ফি', 'Prize', 'স্ট্যাটাস', 'তারিখ'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-white/40 font-medium text-xs whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-3 rounded animate-pulse w-14" style={{ background: '#2a2a35' }} /></td>
                      ))}
                    </tr>
                  ))
                : rooms.map((r: any) => {
                    const seats = Array.isArray(r.seats) ? r.seats : [];
                    const sc = STATUS_COLORS[r.status] ?? STATUS_COLORS['cancelled'];
                    return (
                      <tr key={r.id} className="hover:bg-white/2 transition-colors" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="px-4 py-3 font-mono font-bold text-white">{r.code}</td>
                        <td className="px-4 py-3 text-white/50 text-xs">{r.mode}</td>
                        <td className="px-4 py-3 text-white/60">{seats.length}/{r.maxPlayers}</td>
                        <td className="px-4 py-3 text-white/40 text-xs">{r.entryType}</td>
                        <td className="px-4 py-3 text-yellow-400 font-mono text-xs">{Number(r.entryFee) > 0 ? Number(r.entryFee).toLocaleString() : '—'}</td>
                        <td className="px-4 py-3 text-green-400 font-mono text-xs">{Number(r.prizePool) > 0 ? Number(r.prizePool).toLocaleString() : '—'}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-md text-xs font-medium" style={{ background: sc.bg, color: sc.text }}>{r.status}</span>
                        </td>
                        <td className="px-4 py-3 text-white/30 text-xs whitespace-nowrap">
                          {new Date(r.createdAt).toLocaleString('bn-BD')}
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
