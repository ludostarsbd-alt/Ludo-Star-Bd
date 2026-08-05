import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  upcoming:    { bg: 'rgba(96,165,250,0.15)',  text: '#60a5fa' },
  active:      { bg: 'rgba(52,211,153,0.15)',  text: '#34d399' },
  completed:   { bg: 'rgba(148,163,184,0.1)',  text: '#94a3b8' },
  cancelled:   { bg: 'rgba(248,113,113,0.15)', text: '#f87171' },
};

async function fetchTournaments(offset: number) {
  const params = new URLSearchParams({ limit: '20', offset: String(offset) });
  const res = await fetch(`${BASE}/api/admin/tournaments?${params}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

export function AdminTournaments() {
  const [offset, setOffset] = useState(0);
  const { data, isLoading } = useQuery({ queryKey: ['admin-tournaments', offset], queryFn: () => fetchTournaments(offset) });

  const tournaments = data?.tournaments ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <h3 className="text-white/60 text-sm">মোট টুর্নামেন্ট: {total}</h3>

      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#1a1a22', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['নাম', 'টাইপ', 'Entry', 'Prize Pool', 'Max', 'স্ট্যাটাস', 'শুরু', 'তারিখ'].map((h) => (
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
                : tournaments.map((t: any) => {
                    const sc = STATUS_COLORS[t.status] ?? STATUS_COLORS['cancelled'];
                    return (
                      <tr key={t.id} className="hover:bg-white/2 transition-colors" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="px-4 py-3 text-white font-medium max-w-[160px] truncate">{t.name}</td>
                        <td className="px-4 py-3 text-white/40 text-xs">{t.type}</td>
                        <td className="px-4 py-3 text-yellow-400 font-mono text-xs">{Number(t.entryFee).toLocaleString()}</td>
                        <td className="px-4 py-3 text-green-400 font-mono text-xs">{Number(t.prizePool).toLocaleString()}</td>
                        <td className="px-4 py-3 text-white/50">{t.maxParticipants}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-md text-xs font-medium" style={{ background: sc.bg, color: sc.text }}>{t.status}</span>
                        </td>
                        <td className="px-4 py-3 text-white/30 text-xs whitespace-nowrap">
                          {t.startTime ? new Date(t.startTime).toLocaleString('bn-BD') : '—'}
                        </td>
                        <td className="px-4 py-3 text-white/30 text-xs whitespace-nowrap">
                          {new Date(t.createdAt).toLocaleDateString('bn-BD')}
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
