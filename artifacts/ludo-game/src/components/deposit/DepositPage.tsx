/**
 * Manual deposit page.
 * User fills: payment method, amount, their number, trxId.
 * Submits → server creates a pending request → admin approves/rejects.
 */

import { useState } from 'react';
import { useUser } from '@clerk/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Clock, CheckCircle, XCircle, ChevronDown } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const METHODS = [
  { id: 'bkash',  label: 'bKash',    color: '#E2136E', number: '01XXXXXXXXX' },
  { id: 'nagad',  label: 'Nagad',    color: '#F05A28', number: '01XXXXXXXXX' },
  { id: 'rocket', label: 'Rocket',   color: '#8B5CF6', number: '01XXXXXXXXX' },
  { id: 'upay',   label: 'Upay',     color: '#0EA5E9', number: '01XXXXXXXXX' },
  { id: 'other',  label: 'অন্যান্য', color: '#6B7280', number: '' },
];

const STATUS_MAP = {
  pending:  { label: 'অপেক্ষায়',   color: '#fbbf24', Icon: Clock },
  approved: { label: 'অনুমোদিত',   color: '#34d399', Icon: CheckCircle },
  rejected: { label: 'বাতিল',       color: '#f87171', Icon: XCircle },
};

interface Props { onBack: () => void; }

async function submitDeposit(body: object) {
  const res = await fetch(`${BASE}/api/store/deposit/manual`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed');
  return data;
}

async function fetchMyRequests() {
  const res = await fetch(`${BASE}/api/store/deposit/my-requests`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

export function DepositPage({ onBack }: Props) {
  const { user } = useUser();
  const qc = useQueryClient();

  // Form state
  const [method, setMethod]       = useState(METHODS[0]);
  const [amount, setAmount]       = useState('');
  const [senderNum, setSenderNum] = useState('');
  const [trxId, setTrxId]         = useState('');
  const [note, setNote]           = useState('');
  const [tab, setTab]             = useState<'form' | 'history'>('form');
  const [done, setDone]           = useState(false);

  const { data: history } = useQuery({
    queryKey: ['my-deposits'],
    queryFn: fetchMyRequests,
    enabled: tab === 'history',
  });

  const mutation = useMutation({
    mutationFn: submitDeposit,
    onSuccess: () => {
      setDone(true);
      qc.invalidateQueries({ queryKey: ['my-deposits'] });
      setAmount(''); setSenderNum(''); setTrxId(''); setNote('');
    },
  });

  const handleSubmit = () => {
    if (!amount || !senderNum || !trxId) return;
    mutation.mutate({
      amountBDT: Number(amount),
      paymentMethod: method.id,
      senderNumber: senderNum,
      trxId,
      userNote: note,
    });
  };

  return (
    <div
      className="min-h-[100dvh] flex flex-col"
      style={{ background: 'linear-gradient(160deg, #1b1b1f, #2b0f10)', fontFamily: "'Outfit', sans-serif" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <button onClick={onBack} className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/8 transition-all">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-white font-bold text-lg">ম্যানুয়াল ডিপোজিট</h1>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mx-4 mb-4 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }}>
        {(['form', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setDone(false); }}
            className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: tab === t ? 'rgba(220,38,38,0.7)' : 'transparent',
              color: tab === t ? '#fff' : 'rgba(255,255,255,0.4)',
            }}
          >
            {t === 'form' ? '📤 রিকোয়েস্ট' : '📋 ইতিহাস'}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'form' ? (
          <motion.div key="form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1 px-4 pb-8 space-y-4">

            {/* Success banner */}
            {done && (
              <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)' }}>
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-emerald-400 font-semibold text-sm">রিকোয়েস্ট পাঠানো হয়েছে!</p>
                  <p className="text-emerald-400/70 text-xs mt-0.5">অ্যাডমিন অনুমোদন করলে আপনার একাউন্টে টাকা যোগ হবে।</p>
                </div>
              </div>
            )}

            {/* How-to info */}
            <div className="rounded-2xl p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">কীভাবে ডিপোজিট করবেন</p>
              <ol className="text-white/50 text-xs space-y-1 list-decimal list-inside">
                <li>আমাদের নম্বরে bKash / Nagad / Rocket দিয়ে টাকা পাঠান</li>
                <li>নিচের ফর্মে TrxID ও আপনার নম্বর দিয়ে রিকোয়েস্ট করুন</li>
                <li>অ্যাডমিন verify করে অনুমোদন দিলে balance যোগ হবে</li>
              </ol>
            </div>

            {/* Method picker */}
            <div>
              <label className="text-white/50 text-xs font-medium mb-2 block">পেমেন্ট মাধ্যম</label>
              <div className="flex gap-2 flex-wrap">
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m)}
                    className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                    style={{
                      background: method.id === m.id ? `${m.color}33` : 'rgba(255,255,255,0.06)',
                      color: method.id === m.id ? m.color : 'rgba(255,255,255,0.45)',
                      border: `1.5px solid ${method.id === m.id ? m.color + '88' : 'transparent'}`,
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount */}
            <Field label="পরিমাণ (BDT)" required>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 font-bold">৳</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="যেমন: 500"
                  className="w-full pl-8 pr-3 py-3 rounded-xl text-white outline-none text-sm"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                />
              </div>
            </Field>

            {/* Sender number */}
            <Field label="আপনার নম্বর (যেটা থেকে পাঠিয়েছেন)" required>
              <input
                type="tel"
                value={senderNum}
                onChange={(e) => setSenderNum(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="w-full px-3 py-3 rounded-xl text-white outline-none text-sm"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
              />
            </Field>

            {/* TrxID */}
            <Field label="Transaction ID (TrxID)" required>
              <input
                value={trxId}
                onChange={(e) => setTrxId(e.target.value)}
                placeholder="যেমন: 8FG3H2K1"
                className="w-full px-3 py-3 rounded-xl text-white outline-none text-sm font-mono"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
              />
            </Field>

            {/* Optional note */}
            <Field label="অতিরিক্ত তথ্য (ঐচ্ছিক)">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="কোনো বিশেষ তথ্য থাকলে লিখুন…"
                rows={2}
                className="w-full px-3 py-3 rounded-xl text-white outline-none text-sm resize-none"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
              />
            </Field>

            {mutation.isError && (
              <p className="text-red-400 text-sm text-center">{String(mutation.error)}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={!amount || !senderNum || !trxId || mutation.isPending}
              className="w-full py-4 rounded-2xl font-bold text-white text-base transition-all flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ background: 'rgb(220,38,38)' }}
            >
              <Send className="w-5 h-5" />
              {mutation.isPending ? 'পাঠাচ্ছে…' : 'রিকোয়েস্ট পাঠান'}
            </button>
          </motion.div>
        ) : (
          <motion.div key="history" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1 px-4 pb-8 space-y-3">
            {!history ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
              ))
            ) : history.requests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-white/30">
                <p className="text-4xl mb-3">📭</p>
                <p className="text-sm">এখনো কোনো রিকোয়েস্ট নেই</p>
              </div>
            ) : (
              history.requests.map((r: any) => {
                const s = STATUS_MAP[r.status as keyof typeof STATUS_MAP] ?? STATUS_MAP.pending;
                return (
                  <div
                    key={r.id}
                    className="rounded-2xl p-4 space-y-2"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold text-lg">৳ {Number(r.amountBDT).toFixed(2)}</span>
                      <span className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-lg" style={{ background: `${s.color}18`, color: s.color }}>
                        <s.Icon className="w-3.5 h-3.5" />
                        {s.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-white/40">
                      <span className="font-bold" style={{ color: METHODS.find(m => m.id === r.paymentMethod)?.color ?? '#fff' }}>{r.paymentMethod}</span>
                      <span>•</span>
                      <span className="font-mono">{r.trxId}</span>
                      <span>•</span>
                      <span>{r.senderNumber}</span>
                    </div>
                    {r.adminNote && (
                      <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.05)', color: r.status === 'rejected' ? '#f87171' : '#34d399' }}>
                        অ্যাডমিন: {r.adminNote}
                      </p>
                    )}
                    <p className="text-white/25 text-xs">{new Date(r.createdAt).toLocaleString('bn-BD')}</p>
                  </div>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-white/50 text-xs font-medium mb-1.5 block">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
