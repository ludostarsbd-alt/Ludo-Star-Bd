/**
 * Manual deposit page.
 * User fills: payment method, amount, their number, trxId.
 * Submits → server creates a pending request → admin approves/rejects.
 */

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Clock, CheckCircle, XCircle, ChevronDown, Lock, LogIn } from 'lucide-react';
import { Link } from 'wouter';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const METHODS = [
  { id: 'bkash',  label: 'bKash',    color: '#E2136E' },
  { id: 'nagad',  label: 'Nagad',    color: '#F05A28' },
  { id: 'rocket', label: 'Rocket',   color: '#8B5CF6' },
  { id: 'upay',   label: 'Upay',     color: '#0EA5E9' },
  { id: 'other',  label: 'অন্যান্য', color: '#6B7280' },
] as const;

type PaymentSettings = {
  bkashNumber: string | null;
  nagadNumber: string | null;
  rocketNumber: string | null;
  upayNumber: string | null;
  otherInstructions: string | null;
  minDepositBDT: string;
  maxDepositBDT: string;
  enabledMethods: string[];
};

const DEFAULT_SETTINGS: PaymentSettings = {
  bkashNumber: null,
  nagadNumber: null,
  rocketNumber: null,
  upayNumber: null,
  otherInstructions: null,
  minDepositBDT: '10',
  maxDepositBDT: '100000',
  enabledMethods: ['bkash', 'nagad', 'rocket', 'upay', 'other'],
};

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

async function fetchPaymentSettings(): Promise<{ settings: PaymentSettings }> {
  const res = await fetch(`${BASE}/api/store/payment-settings`);
  if (!res.ok) throw new Error('Payment settings could not be loaded.');
  return res.json();
}

export function DepositPage({ onBack }: Props) {
  const { user, isSignedIn, isLoaded } = useUser();
  const qc = useQueryClient();

  // Form state
  const [method, setMethod]       = useState<(typeof METHODS)[number]>(METHODS[0]);
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
  const { data: paymentData } = useQuery({
    queryKey: ['payment-settings'],
    queryFn: fetchPaymentSettings,
    staleTime: 30_000,
  });
  const paymentSettings = paymentData?.settings ?? DEFAULT_SETTINGS;
  const availableMethods = METHODS.filter((item) => paymentSettings.enabledMethods.includes(item.id));
  const activeMethod = availableMethods.find((item) => item.id === method.id) ?? availableMethods[0] ?? METHODS[0];

  useEffect(() => {
    if (availableMethods.length > 0 && !availableMethods.some((item) => item.id === method.id)) {
      setMethod(availableMethods[0]);
    }
  }, [availableMethods, method.id]);

  const mutation = useMutation({
    mutationFn: submitDeposit,
    onSuccess: () => {
      setDone(true);
      qc.invalidateQueries({ queryKey: ['my-deposits'] });
      setAmount(''); setSenderNum(''); setTrxId(''); setNote('');
    },
  });

  if (!isLoaded) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center text-white">
        <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSignedIn || !user) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-5 text-center text-white">
        <div className="w-full max-w-sm rounded-3xl border border-yellow-400/30 bg-black/45 p-7 shadow-2xl backdrop-blur-md">
          <Lock className="mx-auto mb-4 text-yellow-300" size={34} />
          <h1 className="text-xl font-black mb-2">ডিপোজিট করতে লগইন করুন</h1>
          <p className="text-sm text-white/55 leading-relaxed mb-5">
            সাধারণ গেম guest হিসেবে খেলতে পারবেন। টাকা জমা দিতে একটি account দরকার।
          </p>
          <Link href={`${BASE}/sign-in`}>
            <button className="w-full rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 py-3 font-black text-black flex items-center justify-center gap-2">
              <LogIn size={17} /> লগইন করুন
            </button>
          </Link>
          <button onClick={onBack} className="mt-3 w-full rounded-xl bg-white/10 py-3 text-sm font-bold text-white/70">
            গেমে ফিরে যান
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = () => {
    if (!amount || !senderNum || !trxId || !activeMethod) return;
    mutation.mutate({
      amountBDT: Number(amount),
      paymentMethod: activeMethod.id,
      senderNumber: senderNum,
      trxId,
      userNote: note,
    });
  };

  return (
    <div
      className="min-h-[100dvh] flex flex-col"
      style={{ background: 'transparent', fontFamily: "'Outfit', sans-serif" }}
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
                <li>নিচের merchant নম্বরে {availableMethods.map((item) => item.label).join(' / ') || 'payment'} দিয়ে টাকা পাঠান</li>
                <li>নিচের ফর্মে TrxID ও আপনার নম্বর দিয়ে রিকোয়েস্ট করুন</li>
                <li>অ্যাডমিন verify করে অনুমোদন দিলে balance যোগ হবে</li>
              </ol>
              <p className="text-amber-200/80 text-xs pt-1">
                Deposit limit: ৳{Number(paymentSettings.minDepositBDT).toLocaleString()} – ৳{Number(paymentSettings.maxDepositBDT).toLocaleString()}
              </p>
              {paymentSettings.otherInstructions && (
                <p className="text-cyan-200/80 text-xs pt-1">{paymentSettings.otherInstructions}</p>
              )}
            </div>

            {/* Method picker */}
            <div>
              <label className="text-white/50 text-xs font-medium mb-2 block">পেমেন্ট মাধ্যম</label>
              <div className="flex gap-2 flex-wrap">
                {availableMethods.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m)}
                    className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                    style={{
                     background: activeMethod.id === m.id ? `${m.color}33` : 'rgba(255,255,255,0.06)',
                     color: activeMethod.id === m.id ? m.color : 'rgba(255,255,255,0.45)',
                     border: `1.5px solid ${activeMethod.id === m.id ? m.color + '88' : 'transparent'}`,
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 space-y-1">
                {availableMethods.map((m) => {
                  const number = paymentSettings[`${m.id}Number` as keyof PaymentSettings];
                  if (m.id === 'other' || typeof number !== 'string' || !number) return null;
                  return (
                    <div key={`${m.id}-number`} className="flex items-center justify-between rounded-xl px-3 py-2 text-xs"
                      style={{ background: `${m.color}18`, border: `1px solid ${m.color}35` }}>
                      <span style={{ color: m.color }} className="font-black">{m.label}</span>
                      <span className="font-mono text-white/80">{number}</span>
                    </div>
                  );
                })}
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
              disabled={!amount || !senderNum || !trxId || !activeMethod || mutation.isPending}
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
