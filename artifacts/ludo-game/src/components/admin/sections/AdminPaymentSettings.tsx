import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Save } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const METHODS = [
  ['bkash', 'bKash'],
  ['nagad', 'Nagad'],
  ['rocket', 'Rocket'],
  ['upay', 'Upay'],
  ['other', 'অন্যান্য'],
] as const;

type Settings = {
  bkashNumber: string | null;
  nagadNumber: string | null;
  rocketNumber: string | null;
  upayNumber: string | null;
  otherInstructions: string | null;
  minDepositBDT: string;
  maxDepositBDT: string;
  enabledMethods: string[];
  coinSendEnabled: boolean;
};

const EMPTY: Settings = {
  bkashNumber: '',
  nagadNumber: '',
  rocketNumber: '',
  upayNumber: '',
  otherInstructions: '',
  minDepositBDT: '10',
  maxDepositBDT: '100000',
  enabledMethods: ['bkash', 'nagad', 'rocket', 'upay', 'other'],
  coinSendEnabled: false,
};

async function fetchSettings(): Promise<{ settings: Settings }> {
  const response = await fetch(`${BASE}/api/admin/payment-settings`, { credentials: 'include' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Payment settings could not be loaded.');
  return body;
}

async function saveSettings(settings: Settings): Promise<{ settings: Settings }> {
  const response = await fetch(`${BASE}/api/admin/payment-settings`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...settings,
      bkashNumber: settings.bkashNumber?.trim() || null,
      nagadNumber: settings.nagadNumber?.trim() || null,
      rocketNumber: settings.rocketNumber?.trim() || null,
      upayNumber: settings.upayNumber?.trim() || null,
      otherInstructions: settings.otherInstructions?.trim() || null,
      minDepositBDT: Number(settings.minDepositBDT),
      maxDepositBDT: Number(settings.maxDepositBDT),
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Payment settings could not be saved.');
  return body;
}

export function AdminPaymentSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-payment-settings'],
    queryFn: fetchSettings,
  });
  const [form, setForm] = useState<Settings>(EMPTY);

  useEffect(() => {
    if (data?.settings) setForm(data.settings);
  }, [data]);

  const mutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: (result) => {
      setForm(result.settings);
      queryClient.setQueryData(['admin-payment-settings'], result);
    },
  });

  const update = (key: keyof Settings, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const toggle = (method: string) =>
    setForm((current) => ({
      ...current,
      enabledMethods: current.enabledMethods.includes(method)
        ? current.enabledMethods.filter((item) => item !== method)
        : [...current.enabledMethods, method],
    }));

  if (isLoading) return <div className="h-64 rounded-2xl animate-pulse" style={{ background: '#1a1a22' }} />;
  if (error) return <p className="text-red-400 text-sm">{String(error)}</p>;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-white font-bold text-lg">পেমেন্ট সেটিংস</h2>
        <p className="text-white/40 text-sm mt-1">Deposit screen-এ কোন নম্বর, মাধ্যম ও সীমা দেখাবে তা এখান থেকে নিয়ন্ত্রণ করুন।</p>
      </div>
      <div className="rounded-2xl p-5 space-y-5" style={{ background: '#1a1a22', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div>
          <p className="text-white/60 text-xs font-semibold mb-2">চালু পেমেন্ট মাধ্যম</p>
          <div className="flex flex-wrap gap-2">
            {METHODS.map(([id, label]) => {
              const enabled = form.enabledMethods.includes(id);
              return (
                <button key={id} type="button" onClick={() => toggle(id)}
                  className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
                  style={{ background: enabled ? 'rgba(52,211,153,0.16)' : 'rgba(255,255,255,0.06)', color: enabled ? '#34d399' : 'rgba(255,255,255,0.4)', border: `1px solid ${enabled ? 'rgba(52,211,153,0.4)' : 'transparent'}` }}>
                  {enabled && <Check className="w-3.5 h-3.5" />}{label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-white font-bold text-sm">🏆 Tournament Winner Coin Send</p>
              <p className="text-white/45 text-xs mt-1">চালু করলে সবাই অপশনটি দেখবে; শুধু Tournament Winner Coin Send করতে পারবে।</p>
            </div>
            <button
              type="button"
              onClick={() => setForm((current) => ({ ...current, coinSendEnabled: !current.coinSendEnabled }))}
              className={`w-12 h-7 rounded-full relative shrink-0 transition-colors ${form.coinSendEnabled ? 'bg-emerald-500' : 'bg-white/15'}`}
              aria-label="Toggle Tournament Winner Coin Send"
              aria-pressed={form.coinSendEnabled}
            >
              <span className="absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: form.coinSendEnabled ? 26 : 4 }} />
            </button>
          </div>
          <p className={`text-[11px] mt-3 font-semibold ${form.coinSendEnabled ? 'text-emerald-300' : 'text-white/35'}`}>
            {form.coinSendEnabled ? 'ON — winner unlocked, others locked' : 'OFF — option hidden from players'}
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {(['bkashNumber', 'nagadNumber', 'rocketNumber', 'upayNumber'] as const).map((key) => (
            <label key={key} className="space-y-1">
              <span className="text-white/50 text-xs font-medium">{key.replace('Number', '')} নম্বর</span>
              <input value={form[key] ?? ''} onChange={(event) => update(key, event.target.value)} placeholder="01XXXXXXXXX"
                className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }} />
            </label>
          ))}
          <label className="space-y-1">
            <span className="text-white/50 text-xs font-medium">সর্বনিম্ন Deposit (BDT)</span>
            <input type="number" value={form.minDepositBDT} onChange={(event) => update('minDepositBDT', event.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }} />
          </label>
          <label className="space-y-1">
            <span className="text-white/50 text-xs font-medium">সর্বোচ্চ Deposit (BDT)</span>
            <input type="number" value={form.maxDepositBDT} onChange={(event) => update('maxDepositBDT', event.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }} />
          </label>
        </div>
        <label className="space-y-1 block">
          <span className="text-white/50 text-xs font-medium">অন্যান্য নির্দেশনা</span>
          <textarea value={form.otherInstructions ?? ''} onChange={(event) => update('otherInstructions', event.target.value)} rows={3}
            placeholder="যেমন: Payment করার পর TrxID অবশ্যই দিন"
            className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none resize-none"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }} />
        </label>
        {mutation.isError && <p className="text-red-400 text-sm">{String(mutation.error)}</p>}
        {mutation.isSuccess && <p className="text-emerald-400 text-sm">Payment settings saved.</p>}
        <button type="button" onClick={() => mutation.mutate(form)} disabled={mutation.isPending}
          className="w-full rounded-xl py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-black flex items-center justify-center gap-2">
          <Save className="w-4 h-4" /> {mutation.isPending ? 'Saving…' : 'সেটিংস সংরক্ষণ করুন'}
        </button>
      </div>
    </div>
  );
}