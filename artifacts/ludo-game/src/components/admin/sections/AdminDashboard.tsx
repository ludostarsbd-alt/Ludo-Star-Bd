import { useQuery } from '@tanstack/react-query';
import { Users, DollarSign, Gamepad2, Clock, Coins, TrendingUp } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function fetchStats() {
  const res = await fetch(`${BASE}/api/admin/stats`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load stats');
  return res.json();
}

function StatCard({
  label,
  value,
  sub,
  Icon,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  Icon: React.ElementType;
  color: string;
}) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: '#1a1a22', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs text-white/40 font-medium">{label}</p>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: `${color}22` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <p className="text-2xl font-black text-white">{value}</p>
      {sub && <p className="text-xs text-white/30">{sub}</p>}
    </div>
  );
}

export function AdminDashboard() {
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-stats'], queryFn: fetchStats, refetchInterval: 30_000 });

  if (isLoading) return <Skeleton />;
  if (error) return <Err msg={String(error)} />;

  const { players, finance, activity } = data;

  return (
    <div className="space-y-6">
      <h2 className="text-white font-bold text-lg">ওভারভিউ</h2>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="মোট প্লেয়ার"     value={players.total.toLocaleString()}            Icon={Users}      color="#60a5fa" />
        <StatCard label="মোট রাজস্ব (BDT)"  value={`৳ ${Number(finance.totalRevenueBDT).toFixed(2)}`} Icon={DollarSign} color="#34d399" />
        <StatCard label="সক্রিয় রুম"       value={activity.activeRooms}                       Icon={Gamepad2}   color="#f472b6" />
        <StatCard label="পেন্ডিং পেমেন্ট"  value={finance.pendingOrders}                      Icon={Clock}      color="#fbbf24" />
        <StatCard
          label="মোট কয়েন (সিস্টেমে)"
          value={Number(finance.totalCoinsInSystem).toLocaleString()}
          Icon={Coins}
          color="#a78bfa"
        />
        <StatCard
          label="মোট ডিপোজিট"
          value={activity.totalDeposits}
          sub={`কয়েন কেনা: ${activity.totalCoinPurchases}`}
          Icon={TrendingUp}
          color="#fb923c"
        />
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl p-5 h-28 animate-pulse" style={{ background: '#1a1a22' }} />
      ))}
    </div>
  );
}

function Err({ msg }: { msg: string }) {
  return <p className="text-red-400 text-sm">{msg}</p>;
}
