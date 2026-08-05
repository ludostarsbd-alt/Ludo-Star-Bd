import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const STATUS_MAP = {
  pending:  { label: 'অপেক্ষায়', color: '#fbbf24', Icon: Clock },
  approved: { label: 'অনুমোদিত', color: '#34d399', Icon: CheckCircle },
  rejected: { label: 'বাতিল',    color: '#f87171', Icon: XCircle },
};

const METHOD_COLORS: Record<string, string> = {
  bkash: '#E2136E', nagad: '#F05A28', rocket: '#8B5CF6', upay: '#0EA5E9', other: '#6B7280',
};

async function fetchRequests(status: string, offset: number) {
  const params = new URLSearchParams({ limit: '20', offset: String(offset) });
  if (status) params.set('status', status);
  const res = await fetch(`${BASE}/api/admin/deposit-requests?${params}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

interface ActionModal {
  id: string;
  displayName: string;
  amountBDT: number;
  trxId: string;
  action: 'approve' | 'reject';
}

export function AdminDepositRequests() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [offset, setOffset] = useState(0);
  const [modal, setModal] = useState<ActionModal | null>(null);
  const [adminNote, setAdminNote] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-deposits', statusFilter, offset],
    queryFn: () => fetchRequests(statusFilter, offset),
    refetchInterval: 15_000, // auto-refresh every 15s for pending
  });

  const actMutation = useMutation({
    mutationFn: async ({ id, action, note }: { id: string; action: string; note: string }) => {
      const res = await fetch(`${BASE}/api/admin/deposit-requests/${id}/${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminNote: note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-deposits'] });
      setModal(null);
      setAdminNote('');
    },
  });

  const requests = data?.requests ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {['', 'pending', 'approved', 'rejected'].map((s) => {
          const sm = s ? STATUS_MAP[s as keyof typeof STATUS_MAP] : null;
          return (
            <button
              key={s || 'all'}
              onClick={() => { setStatusFilter(s); setOffset(0); }}
              className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5"
              style={{
                background: statusFilter === s ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.06)',
                color: statusFilter === s ? '#f87171' : 'rgba(255,255,255,0.45)',
                border: `1px solid ${statusFilter === s ? 'rgba(220,38,38,0.4)' : 'transparent'}`,
              }}
            >
              {sm && <sm.Icon className="w-3 h-3" style={{ color: sm.color }} />}
              {sm ? sm.label : 'সব'}
            </button>
          );
        })}
        <span className="ml-auto text-white/30 text-xs">মোট {total}</span>
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: '#1a1a22' }} />
            ))
          : requests.length === 0
          ? (
            <div className="flex flex-col items-center py-16 text-white/30">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-sm">কোনো রিকোয়েস্ট নেই</p>
            </div>
          )
          : requests.map((r: any) => {
              const sm = STATUS_MAP[r.status as keyof typeof STATUS_MAP] ?? STATUS_MAP.pending;
              const mc = METHOD_COLORS[r.paymentMethod] ?? '#6B7280';
              return (
                <div
                  key={r.id}
                  className="rounded-2xl p-4"
                  style={{ background: '#1a1a22', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Left info */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-black text-xl">৳ {Number(r.amountBDT).toFixed(2)}</span>
                        <span
                          className="px-2 py-0.5 rounded-lg text-xs font-bold"
                          style={{ background: `${mc}22`, color: mc }}
                        >
                          {r.paymentMethod}
                        </span>
                        <span
                          className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold"
                          style={{ background: `${sm.color}18`, color: sm.color }}
                        >
                          <sm.Icon className="w-3 h-3" />
                          {sm.label}
                        </span>
                      </div>

                      <div className="text-white/60 text-sm font-medium">{r.displayName}</div>

                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-white/40">
                        <span>📞 {r.senderNumber}</span>
                        <span>🔑 TrxID: <span className="font-mono text-white/60">{r.trxId}</span></span>
                      </div>

                      {r.userNote && (
                        <p className="text-white/35 text-xs italic">"{r.userNote}"</p>
                      )}

                      {r.adminNote && (
                        <p className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', color: r.status === 'rejected' ? '#f87171' : '#34d399' }}>
                          অ্যাডমিন নোট: {r.adminNote}
                        </p>
                      )}

                      <p className="text-white/25 text-xs">
                        {new Date(r.createdAt).toLocaleString('bn-BD')}
                      </p>
                    </div>

                    {/* Actions (only for pending) */}
                    {r.status === 'pending' && (
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <button
                          onClick={() => setModal({ id: r.id, displayName: r.displayName, amountBDT: Number(r.amountBDT), trxId: r.trxId, action: 'approve' })}
                          className="px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                          style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          অনুমোদন
                        </button>
                        <button
                          onClick={() => setModal({ id: r.id, displayName: r.displayName, amountBDT: Number(r.amountBDT), trxId: r.trxId, action: 'reject' })}
                          className="px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                          style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          বাতিল
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2">
        <button disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 20))} className="p-2 rounded-lg disabled:opacity-30 hover:bg-white/8 transition-all">
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <span className="text-white/30 text-xs">{Math.floor(offset / 20) + 1} / {Math.max(1, Math.ceil(total / 20))}</span>
        <button disabled={offset + 20 >= total} onClick={() => setOffset((o) => o + 20)} className="p-2 rounded-lg disabled:opacity-30 hover:bg-white/8 transition-all">
          <ChevronRight className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Action confirmation modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4" style={{ background: '#1e1e2a', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div>
              <h3 className="text-white font-bold text-lg">
                {modal.action === 'approve' ? '✅ অনুমোদন করবেন?' : '❌ বাতিল করবেন?'}
              </h3>
              <p className="text-white/50 text-sm mt-1">
                {modal.displayName} — <span className="text-white font-bold">৳ {modal.amountBDT.toFixed(2)}</span>
              </p>
              <p className="text-white/30 text-xs mt-0.5 font-mono">TrxID: {modal.trxId}</p>
            </div>

            {modal.action === 'approve' && (
              <div className="rounded-xl p-3" style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)' }}>
                <p className="text-emerald-400 text-xs">
                  অনুমোদন দিলে <strong>৳ {modal.amountBDT.toFixed(2)}</strong> তাৎক্ষণিকভাবে প্লেয়ারের cash balance-এ যোগ হবে।
                </p>
              </div>
            )}

            <div>
              <label className="text-white/40 text-xs mb-1.5 block">
                {modal.action === 'approve' ? 'অ্যাডমিন নোট (ঐচ্ছিক)' : 'বাতিলের কারণ *'}
              </label>
              <input
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder={modal.action === 'approve' ? 'যাচাই করা হয়েছে' : 'TrxID মেলেনি / পরিমাণ ভুল…'}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{ background: '#2a2a35', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>

            {actMutation.isError && (
              <p className="text-red-400 text-xs">{String(actMutation.error)}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setModal(null); setAdminNote(''); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white transition-all"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                বাতিল
              </button>
              <button
                onClick={() => actMutation.mutate({ id: modal.id, action: modal.action, note: adminNote })}
                disabled={actMutation.isPending || (modal.action === 'reject' && !adminNote)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
                style={{
                  background: modal.action === 'approve' ? 'rgb(5,150,105)' : 'rgb(185,28,28)',
                }}
              >
                {actMutation.isPending ? 'হচ্ছে…' : modal.action === 'approve' ? 'হ্যাঁ, অনুমোদন দিন' : 'হ্যাঁ, বাতিল করুন'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
