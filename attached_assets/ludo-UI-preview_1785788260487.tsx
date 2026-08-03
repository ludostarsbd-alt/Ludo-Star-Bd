import React, { useState, useEffect, useRef } from "react";
import {
  Gift, Users, Trophy, ChevronRight, ChevronLeft, UserPlus,
  Home as HomeIcon, Store as StoreIcon, MessageCircle, Bell, Settings,
  Coins, Wallet, Check, X, Volume2, Music, Vibrate, Globe2, ShieldCheck,
  HelpCircle, LogOut, UserCog, Search, Sparkles, Copy, Loader2, Banknote,
  Award, Swords, Crown, Flag,
} from "lucide-react";

const PHASES = ["GROUP", "KNOCKOUT", "QUARTER", "SEMI", "FINAL"];
const STEP_DELAY = 600;
const FIREWORK_DURATION = 1800;
const RESTART_DELAY = 900;

/* ================= Shared UI ================= */

function GlassCard({ children, gradient = "dark", interactive, className = "" }) {
  const gradients = {
    purple: "from-purple-900/60 via-purple-800/30 to-black/60 border-purple-400/30",
    dark: "from-yellow-950/80 via-amber-900/40 to-[#0a0800]/90 border-orange-500",
    navy: "from-slate-900/80 via-slate-800/40 to-black/60 border-white/10",
  };
  return (
    <div
      className={`rounded-2xl border backdrop-blur-md bg-gradient-to-br ${gradients[gradient]} ${
        interactive ? "hover:brightness-110 active:scale-[0.98] transition-all" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

function TopBar({ username, level, coins, cash, onPlusCoins, onPlusCash, onOpenProfile }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 w-full max-w-md mx-auto">
      <button onClick={onOpenProfile} className="flex items-center gap-2 active:scale-95 transition-transform">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 border-2 border-white/30 flex items-center justify-center text-sm font-black text-white">
          {username?.[0] ?? "P"}
        </div>
        <div className="flex flex-col leading-none items-start">
          <span className="text-white text-xs font-bold">{username}</span>
          <span className="text-cyan-300 text-[10px] font-semibold">Lvl {level}</span>
        </div>
      </button>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-black/40 border border-yellow-400/40 rounded-full pl-2 pr-1 py-0.5">
          <span className="text-yellow-300 text-xs font-bold">🪙 {coins?.toLocaleString()}</span>
          <button
            onClick={onPlusCoins}
            className="w-5 h-5 rounded-full bg-yellow-400 text-black text-xs font-black flex items-center justify-center active:scale-90 transition-transform"
          >
            +
          </button>
        </div>
        <div className="flex items-center gap-1 bg-black/40 border border-green-400/40 rounded-full pl-2 pr-1 py-0.5">
          <span className="text-green-300 text-xs font-bold">💵 {cash?.toLocaleString()}</span>
          <button
            onClick={onPlusCash}
            className="w-5 h-5 rounded-full bg-green-400 text-black text-xs font-black flex items-center justify-center active:scale-90 transition-transform"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

function BottomNav({ active, onNavigate }) {
  const items = [
    { key: "home", icon: HomeIcon, label: "Home" },
    { key: "store", icon: StoreIcon, label: "Store" },
    { key: "message", icon: MessageCircle, label: "Message" },
    { key: "notifi", icon: Bell, label: "Notifi" },
    { key: "settings", icon: Settings, label: "Settings" },
  ];
  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 bg-[#050818]/95 border-t border-white/10 backdrop-blur-md">
      <div className="max-w-md mx-auto flex items-center justify-around py-2">
        {items.map(({ key, icon: Icon, label }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              className="flex flex-col items-center gap-0.5 px-2 py-1 active:scale-90 transition-transform"
            >
              <Icon size={20} className={isActive ? "text-cyan-300" : "text-white/40"} />
              <span className={`text-[9px] font-semibold ${isActive ? "text-cyan-300" : "text-white/40"}`}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScreenHeader({ title, onBack, right }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 w-full max-w-md mx-auto">
      <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center active:scale-90 transition-transform">
        <ChevronLeft size={18} className="text-white" />
      </button>
      <h2 className="text-white font-black italic text-lg tracking-wide">{title}</h2>
      <div className="w-9 h-9 flex items-center justify-center">{right}</div>
    </div>
  );
}

function Link({ href, className, children, onClick }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        onClick && onClick();
      }}
      className={className}
    >
      {children}
    </a>
  );
}

function ScreenShell({ children, activeNav, onNavigate }) {
  return (
    <div className="h-screen w-full relative flex flex-col overflow-x-hidden overflow-y-hidden bg-[#050818]">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-indigo-950/70 via-[#050818] to-black opacity-80" />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#050818]/60 via-[#050818]/20 to-[#050818] pointer-events-none" />
      <div className="relative z-10 flex flex-col flex-1 pb-24 overflow-y-auto">{children}</div>
      <BottomNav active={activeNav} onNavigate={onNavigate} />
    </div>
  );
}

/* ================= Toggle switch (Settings) ================= */

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full relative transition-colors duration-200 ${checked ? "bg-cyan-500" : "bg-white/15"}`}
    >
      <span
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200"
        style={{ left: checked ? 22 : 2 }}
      />
    </button>
  );
}

/* ================= Tournament cycle (unchanged) ================= */

function useTournamentCycle() {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [showFireworks, setShowFireworks] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    let step = 0;
    let cancelled = false;

    function advance() {
      if (cancelled) return;
      if (step < PHASES.length) {
        setActiveIndex(step);
        step++;
        timerRef.current = setTimeout(advance, STEP_DELAY);
      } else {
        setShowFireworks(true);
        timerRef.current = setTimeout(() => {
          if (cancelled) return;
          setShowFireworks(false);
          setActiveIndex(-1);
          step = 0;
          timerRef.current = setTimeout(advance, RESTART_DELAY);
        }, FIREWORK_DURATION);
      }
    }

    timerRef.current = setTimeout(advance, 400);
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { activeIndex, showFireworks };
}

function TournamentPhaseRoadmap({ activeIndex }) {
  return (
    <div className="flex items-center justify-center gap-1 text-[10px] font-black tracking-wide">
      {PHASES.map((phase, i) => {
        const isActive = i <= activeIndex;
        const isCurrent = i === activeIndex;
        const isFinal = phase === "FINAL";
        return (
          <React.Fragment key={phase}>
            <span
              className="transition-all duration-300"
              style={{
                color: isActive ? (isFinal ? "#facc15" : "#ffffff") : "rgba(255,255,255,0.25)",
                textShadow: isCurrent
                  ? isFinal
                    ? "0 0 12px #facc15, 0 0 24px #facc15"
                    : "0 0 10px #fff, 0 0 20px rgba(255,255,255,0.6)"
                  : "none",
                transform: isCurrent ? "scale(1.2)" : "scale(1)",
                display: "inline-block",
              }}
            >
              {phase}
            </span>
            {i < PHASES.length - 1 && (
              <ChevronRight
                size={9}
                style={{
                  color: i < activeIndex ? "#facc15" : "rgba(255,255,255,0.2)",
                  transition: "color 0.3s ease",
                  flexShrink: 0,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function WinnerCupBurst({ active }) {
  return (
    <div className="relative flex items-center justify-center w-16 h-16">
      <div
        className="absolute inset-0 bg-yellow-400 rounded-full"
        style={{
          filter: "blur(16px)",
          opacity: active ? 0.9 : 0.6,
          transform: active ? "scale(2.1)" : "scale(1.5)",
          transition: "all 0.3s ease",
        }}
      />
      {active && (
        <>
          <span className="absolute rounded-full border-2 border-yellow-300" style={{ width: 20, height: 20, animation: "cup-ring 1s ease-out infinite" }} />
          <span className="absolute rounded-full border-2 border-yellow-300" style={{ width: 20, height: 20, animation: "cup-ring 1s ease-out infinite 0.35s" }} />
        </>
      )}
      <Trophy
        className="relative z-10 text-yellow-300"
        size={40}
        style={{
          filter: active
            ? "drop-shadow(0 0 22px rgba(250,204,21,1)) drop-shadow(0 0 40px rgba(250,204,21,0.6))"
            : "drop-shadow(0 0 18px rgba(250,204,21,1))",
          transform: active ? "scale(1.35)" : "scale(1)",
          transition: active ? "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)" : "transform 0.4s ease-in",
          transformOrigin: "50% 90%",
        }}
      />
      {active && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-visible">
          {Array.from({ length: 16 }).map((_, i) => {
            const angle = (i / 16) * 360;
            const dist = 34 + Math.random() * 22;
            const rad = (angle * Math.PI) / 180;
            const tx = Math.cos(rad) * dist;
            const ty = Math.sin(rad) * dist;
            const colors = ["#facc15", "#fb923c", "#f472b6", "#34d399", "#60a5fa", "#fff"];
            const color = colors[i % colors.length];
            return (
              <span
                key={i}
                style={{
                  position: "absolute", width: 5, height: 5, borderRadius: "50%", background: color,
                  boxShadow: `0 0 6px 2px ${color}`, animation: "fw-burst 0.8s ease-out infinite",
                  animationDelay: `${(i % 5) * 0.12}s`, "--tx": `${tx}px`, "--ty": `${ty}px`,
                }}
              />
            );
          })}
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i / 8) * 360 + 13;
            const dist = 26 + Math.random() * 16;
            const rad = (angle * Math.PI) / 180;
            const tx = Math.cos(rad) * dist;
            const ty = Math.sin(rad) * dist;
            return (
              <span
                key={"s" + i}
                style={{
                  position: "absolute", width: 3, height: 10, borderRadius: 2, background: "#facc15",
                  boxShadow: "0 0 8px #facc15", transform: `rotate(${angle}deg)`,
                  animation: "fw-burst 0.6s ease-out infinite", animationDelay: `${(i % 4) * 0.15}s`,
                  "--tx": `${tx}px`, "--ty": `${ty}px`,
                }}
              />
            );
          })}
        </div>
      )}
      <style>{`
        @keyframes fw-burst {
          0%   { transform: translate(0,0) scale(1); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) scale(0.2); opacity: 0; }
        }
        @keyframes cup-ring {
          0%   { opacity: 0.9; transform: scale(1); }
          100% { opacity: 0; transform: scale(3.2); }
        }
      `}</style>
    </div>
  );
}

/* ================= HOME SCREEN ================= */

function HomeScreen({ profile, onNavigate, onPlusCoins, onPlusCash, dailyClaimed }) {
  const { activeIndex, showFireworks } = useTournamentCycle();

  return (
    <ScreenShell activeNav="home" onNavigate={onNavigate}>
      <TopBar
        username={profile.username}
        level={profile.level}
        coins={profile.coins}
        cash={profile.cash}
        onPlusCoins={onPlusCoins}
        onPlusCash={onPlusCash}
        onOpenProfile={() => onNavigate("profile")}
      />

      <div className="flex-1 flex flex-col items-center pt-4 px-4 w-full max-w-md mx-auto">
        <div className="text-center mb-6 relative">
          <h1 className="text-6xl font-black italic tracking-wider text-white leading-none" style={{ textShadow: "0 0 20px rgba(96,165,250,0.8), 0 0 40px rgba(96,165,250,0.4)" }}>
            LUDO
          </h1>
          <div className="flex items-center justify-center gap-3 mt-1">
            <div className="h-[2px] w-12 bg-gradient-to-r from-transparent to-cyan-400" />
            <span className="text-xl font-black italic text-cyan-300 uppercase tracking-widest" style={{ textShadow: "0 0 12px rgba(103,232,249,0.8)" }}>
              StarBD
            </span>
            <div className="h-[2px] w-12 bg-gradient-to-l from-transparent to-cyan-400" />
          </div>
        </div>

        <div className="relative mb-8 group">
          <div className="absolute inset-0 rounded-3xl opacity-50" style={{ background: "conic-gradient(from 0deg, #f87171, #facc15, #4ade80, #60a5fa, #f87171)", filter: "blur(20px)" }} />
          <div className="w-48 h-48 rounded-3xl relative z-10 shadow-[0_0_40px_rgba(0,0,0,0.8)] border-2 border-white/10 grid grid-cols-2 grid-rows-2 overflow-hidden transition-transform duration-700 ease-out hover:rotate-[360deg] active:scale-95">
            <div className="bg-red-500" /><div className="bg-green-500" /><div className="bg-yellow-400" /><div className="bg-blue-500" />
          </div>
        </div>

        <button onClick={() => onNavigate("daily")} className="w-full block mb-6">
          <GlassCard gradient="purple" interactive className="w-full p-3 flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center border border-purple-400/50"
                style={{
                  boxShadow: dailyClaimed ? "none" : "0 0 10px rgba(168,85,247,0.5)",
                  animation: dailyClaimed ? "none" : "giftGlow 1.6s ease-in-out infinite",
                }}
              >
                <Gift
                  className="text-purple-300"
                  size={20}
                  style={{ animation: dailyClaimed ? "none" : "giftShake 1.4s ease-in-out infinite" }}
                />
              </div>
              <div className="flex flex-col text-left">
                <span className="font-bold text-white text-sm">{dailyClaimed ? "Daily Bonus Claimed" : "Daily Bonus Ready!"}</span>
                <span className="text-xs text-purple-200">{dailyClaimed ? "কালকে আবার আসুন" : "Tap to claim your reward"}</span>
              </div>
            </div>
            <ChevronRight className="text-purple-300" size={20} />
          </GlassCard>
        </button>

        <div className="w-full grid grid-cols-2 gap-4 mb-4">
          <Link href="/play" className="block w-full">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 p-3 border border-blue-400/50 shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] transition-all active:scale-95 flex flex-col items-center justify-center gap-1 h-28 group">
              <span className="text-4xl leading-none transition-transform duration-300 group-hover:scale-125 group-active:scale-95 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]" style={{ animation: "spin 6s linear infinite", display: "inline-block" }}>🌍</span>
              <span className="font-black italic text-lg tracking-wide text-white drop-shadow-md leading-none">PLAY</span>
              <span className="text-[10px] text-blue-200/80 font-semibold tracking-wide leading-none">online with real players</span>
            </div>
          </Link>
          <Link href="/friends" className="block w-full">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-600 to-green-800 p-3 border border-green-400/50 shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:shadow-[0_0_30px_rgba(34,197,94,0.5)] transition-all active:scale-95 flex flex-col items-center justify-center gap-1 h-28 group">
              <Users className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] transition-transform duration-300 group-hover:scale-125 group-active:scale-95" style={{ animation: "friendBounce 1.6s ease-in-out infinite" }} size={36} strokeWidth={1.5} />
              <span className="font-black italic text-lg tracking-wide text-white drop-shadow-md leading-none">PLAY</span>
              <span className="text-[10px] text-green-200/80 font-semibold tracking-wide leading-none">with friends</span>
            </div>
          </Link>
        </div>

        <div className="w-full mb-4 mt-8 relative">
          <Link href="/tournament" className="block w-full">
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
              <WinnerCupBurst active={showFireworks} />
            </div>
            <GlassCard gradient="dark" className="w-full p-4 pt-10 shadow-[0_0_24px_rgba(250,204,21,0.35)] overflow-visible" interactive>
              <div className="text-center" style={{ animation: "pulseGlow 2.4s ease-in-out infinite" }}>
                <h3 className="font-black italic text-2xl tracking-widest text-yellow-400 mb-2" style={{ textShadow: "0 0 14px rgba(250,204,21,0.7)" }}>TOURNAMENT</h3>
                <TournamentPhaseRoadmap activeIndex={activeIndex} />
              </div>
            </GlassCard>
          </Link>
        </div>

        <div className="w-full grid grid-cols-2 gap-4">
          <button onClick={() => onNavigate("ranking")} className="block w-full">
            <div className="h-14 rounded-xl bg-gradient-to-r from-red-600 to-rose-500 px-3 flex items-center gap-3 border border-red-400/30 shadow-lg active:scale-95 transition-transform">
              <div className="w-9 h-9 shrink-0 bg-white/20 rounded-lg flex items-center justify-center">
                <span className="text-lg leading-none">🥇</span>
              </div>
              <span className="font-bold text-sm text-white italic tracking-wide">RANKING</span>
            </div>
          </button>

          <button onClick={() => onNavigate("invite")} className="block w-full text-left">
            <div className="h-14 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-3 flex items-center gap-3 border border-yellow-300/50 shadow-lg active:scale-95 transition-transform">
              <div className="w-9 h-9 shrink-0 bg-black/20 rounded-lg flex items-center justify-center">
                <UserPlus className="text-[#050818]" size={18} />
              </div>
              <span className="font-bold text-sm text-[#050818] italic tracking-wide">INVITE</span>
            </div>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes friendBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes pulseGlow { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.15); } }
        @keyframes giftShake {
          0%, 100% { transform: rotate(0deg) scale(1); }
          10% { transform: rotate(-12deg) scale(1.05); }
          20% { transform: rotate(10deg) scale(1.05); }
          30% { transform: rotate(-8deg) scale(1.05); }
          40% { transform: rotate(6deg) scale(1.05); }
          50% { transform: rotate(0deg) scale(1); }
        }
        @keyframes giftGlow {
          0%, 100% { box-shadow: 0 0 8px rgba(168,85,247,0.4); }
          50% { box-shadow: 0 0 18px rgba(168,85,247,0.8); }
        }
      `}</style>
    </ScreenShell>
  );
}

/* ================= STORE SCREEN ================= */

const COIN_PACKS = [
  { id: "c1", amount: 1000, price: 10 },
  { id: "c2", amount: 5000, price: 45 },
  { id: "c3", amount: 10000, price: 85, badge: "জনপ্রিয়" },
  { id: "c4", amount: 25000, price: 200 },
  { id: "c5", amount: 50000, price: 380 },
  { id: "c6", amount: 100000, price: 700, badge: "সেরা মূল্য" },
  { id: "c7", amount: 500000, price: 3200 },
  { id: "c8", amount: 1000000, price: 6000 },
];

function PackCard({ icon, amount, price, badge, unit, onBuy, disabled }) {
  return (
    <div className={`relative rounded-2xl border border-white/10 bg-white/5 p-3 flex flex-col items-center gap-1 ${disabled ? "opacity-50" : ""}`}>
      {badge && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-black px-2 py-0.5 rounded-full bg-gradient-to-r from-yellow-400 to-orange-400 text-black whitespace-nowrap">
          {badge}
        </span>
      )}
      <span className="text-2xl leading-none mt-1">{icon}</span>
      <span className="text-white font-black text-sm">{amount.toLocaleString()}</span>
      <span className="text-white/50 text-[10px] -mt-1">{unit}</span>
      <button
        onClick={() => onBuy(amount, price)}
        className={`mt-1 w-full rounded-lg text-xs font-bold py-1.5 active:scale-95 transition-transform ${
          disabled ? "bg-white/10 text-white/40" : "bg-gradient-to-r from-cyan-500 to-blue-600 text-white"
        }`}
      >
        ৳{price.toLocaleString()}
      </button>
    </div>
  );
}

function StoreScreen({ profile, onNavigate, onBuy }) {
  const [toast, setToast] = useState(null);

  function handleBuy(amount, price) {
    if (profile.cash < price) {
      setToast({ type: "error", text: "অপর্যাপ্ত ক্যাশ! আগে ডিপোজিট করুন" });
      setTimeout(() => setToast(null), 2200);
      return;
    }
    onBuy(amount, price);
    setToast({ type: "success", text: `${amount.toLocaleString()} কয়েন যোগ হয়েছে, ৳${price} কাটা হয়েছে` });
    setTimeout(() => setToast(null), 2200);
  }

  return (
    <ScreenShell activeNav="store" onNavigate={onNavigate}>
      <ScreenHeader title="Store" onBack={() => onNavigate("home")} />

      <div className="px-4 w-full max-w-md mx-auto flex-1">
        {/* balances */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1 rounded-xl bg-black/40 border border-yellow-400/30 px-3 py-2 flex items-center justify-between">
            <span className="text-yellow-300 text-xs font-bold">🪙 কয়েন</span>
            <span className="text-white font-black text-sm">{profile.coins.toLocaleString()}</span>
          </div>
          <div className="flex-1 rounded-xl bg-black/40 border border-green-400/30 px-3 py-2 flex items-center justify-between">
            <span className="text-green-300 text-xs font-bold">💵 ক্যাশ</span>
            <span className="text-white font-black text-sm">৳{profile.cash.toLocaleString()}</span>
          </div>
        </div>

        <p className="text-white/50 text-[11px] mb-2 flex items-center gap-1">
          <Coins size={12} /> কয়েন কিনুন — মূল্য তোমার ক্যাশ ব্যালেন্স থেকে কাটা হবে
        </p>

        {/* packs grid */}
        <div className="grid grid-cols-2 gap-3 pb-4">
          {COIN_PACKS.map((p) => (
            <PackCard
              key={p.id}
              icon="🪙"
              amount={p.amount}
              price={p.price}
              badge={p.badge}
              unit="কয়েন"
              disabled={profile.cash < p.price}
              onBuy={handleBuy}
            />
          ))}
        </div>

        {/* payment methods */}
        <div className="mb-6">
          <p className="text-white/50 text-[11px] mb-2">পেমেন্ট মেথড</p>
          <div className="flex gap-2">
            {["bKash", "Nagad", "Rocket", "Card"].map((m) => (
              <div key={m} className="flex-1 rounded-lg bg-white/5 border border-white/10 py-2 text-center text-[10px] font-bold text-white/70">
                {m}
              </div>
            ))}
          </div>
        </div>
      </div>

      {toast && (
        <div
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-30 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-1 ${
            toast.type === "error" ? "bg-red-500" : "bg-emerald-500"
          }`}
        >
          {toast.type === "error" ? <X size={14} /> : <Check size={14} />} {toast.text}
        </div>
      )}
    </ScreenShell>
  );
}

/* ================= DEPOSIT SCREEN (real money → Cash) ================= */

const DEPOSIT_METHODS = [
  { id: "bkash", label: "bKash", number: "01711-223344", color: "from-pink-600 to-pink-700" },
  { id: "nagad", label: "Nagad", number: "01911-556677", color: "from-orange-600 to-red-600" },
  { id: "rocket", label: "Rocket", number: "01611-889900", color: "from-purple-600 to-indigo-700" },
];

const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000];
const BD_PHONE_REGEX = /^01[3-9]\d{8}$/;
const TRX_ID_REGEX = /^[A-Z0-9]{8,10}$/;

function DepositScreen({ profile, onNavigate, onDeposit, usedTrxIds }) {
  const [method, setMethod] = useState(DEPOSIT_METHODS[0].id);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [trxId, setTrxId] = useState("");
  const [status, setStatus] = useState("form"); // form | processing | success
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const selected = DEPOSIT_METHODS.find((m) => m.id === method);
  const numericAmount = Number(amount) || 0;
  const cleanTrxId = trxId.trim().toUpperCase();

  const phoneValid = BD_PHONE_REGEX.test(phone.trim());
  const trxFormatValid = TRX_ID_REGEX.test(cleanTrxId);
  const isDuplicate = usedTrxIds.includes(cleanTrxId);
  const canSubmit = phoneValid && numericAmount >= 100 && trxFormatValid && !isDuplicate;

  function copyNumber() {
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  function submit() {
    setError(null);
    if (!phoneValid) return setError("সঠিক বাংলাদেশি মোবাইল নাম্বার দিন (যেমনঃ 017XXXXXXXX)");
    if (numericAmount < 100) return setError("ন্যূনতম ৳১০০ ডিপোজিট করতে হবে");
    if (!trxFormatValid) return setError("সঠিক ফরম্যাটে Transaction ID দিন (৮-১০ ডিজিট/অক্ষর)");
    if (isDuplicate) return setError("এই Transaction ID আগেই ব্যবহার হয়েছে — একই TrxID দিয়ে দুইবার ডিপোজিট করা যায় না");

    setStatus("processing");
    setTimeout(() => {
      onDeposit(numericAmount, cleanTrxId);
      setStatus("success");
    }, 1500);
  }

  if (status === "success") {
    return (
      <ScreenShell activeNav="home" onNavigate={onNavigate}>
        <ScreenHeader title="Deposit" onBack={() => onNavigate("home")} />
        <div className="px-4 w-full max-w-md mx-auto flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-400/40 flex items-center justify-center">
            <Check size={30} className="text-green-300" />
          </div>
          <div>
            <h3 className="text-white font-black text-lg">ডিপোজিট সফল হয়েছে!</h3>
            <p className="text-white/50 text-xs mt-1">৳{numericAmount.toLocaleString()} আপনার ক্যাশ ব্যালেন্সে যোগ হয়েছে</p>
            <p className="text-white/30 text-[10px] mt-1">TrxID: {cleanTrxId}</p>
          </div>
          <div className="rounded-xl bg-black/40 border border-green-400/30 px-4 py-2 w-full">
            <span className="text-green-300 text-xs font-bold">💵 নতুন ব্যালেন্স: ৳{profile.cash.toLocaleString()}</span>
          </div>
          <button
            onClick={() => onNavigate("home")}
            className="w-full rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-sm py-3 active:scale-95 transition-transform"
          >
            হোমে ফিরুন
          </button>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell activeNav="home" onNavigate={onNavigate}>
      <ScreenHeader title="Deposit" onBack={() => onNavigate("home")} />

      <div className="px-4 w-full max-w-md mx-auto flex-1 pb-4">
        <div className="rounded-xl bg-black/40 border border-green-400/30 px-3 py-2 flex items-center justify-between mb-4">
          <span className="text-green-300 text-xs font-bold flex items-center gap-1"><Banknote size={13} /> বর্তমান ক্যাশ (রিয়েল টাকা)</span>
          <span className="text-white font-black text-sm">৳{profile.cash.toLocaleString()}</span>
        </div>

        {/* Step 1: method */}
        <p className="text-white/50 text-[11px] mb-2">১. পেমেন্ট মেথড বাছাই করুন</p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {DEPOSIT_METHODS.map((m) => (
            <button
              key={m.id}
              onClick={() => setMethod(m.id)}
              className={`rounded-xl border p-2 text-center transition-all ${
                method === m.id ? "border-white/60 bg-white/10 scale-[1.03]" : "border-white/10 bg-white/5"
              }`}
            >
              <div className={`w-full h-8 rounded-lg bg-gradient-to-r ${m.color} mb-1 flex items-center justify-center`}>
                <span className="text-white text-[10px] font-black">{m.label}</span>
              </div>
              {method === m.id && <Check size={12} className="text-white mx-auto" />}
            </button>
          ))}
        </div>

        {/* Step 2: send money instructions */}
        <p className="text-white/50 text-[11px] mb-2">২. এই নাম্বারে টাকা পাঠান (Send Money)</p>
        <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 mb-4">
          <span className="text-white font-bold text-sm tracking-wide">{selected.number}</span>
          <button onClick={copyNumber} className="flex items-center gap-1 text-cyan-300 text-[11px] font-bold active:scale-90 transition-transform">
            <Copy size={13} /> {copied ? "কপি হয়েছে" : "কপি"}
          </button>
        </div>

        {/* Step 3: sender's real phone number */}
        <p className="text-white/50 text-[11px] mb-2">৩. যে নাম্বার থেকে টাকা পাঠিয়েছেন</p>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 11))}
          placeholder="যেমনঃ 017XXXXXXXX"
          className={`w-full rounded-xl bg-white/5 border px-3 py-2.5 text-white text-sm outline-none mb-1 ${
            phone.length > 0 && !phoneValid ? "border-red-400/60" : "border-white/10 focus:border-green-400/50"
          }`}
        />
        {phone.length > 0 && !phoneValid && (
          <p className="text-red-300 text-[10px] mb-3">১১ ডিজিটের সঠিক বাংলাদেশি নাম্বার দিন (017/018/019/016/013/014/015)</p>
        )}
        {(phone.length === 0 || phoneValid) && <div className="mb-3" />}

        {/* Step 4: amount */}
        <p className="text-white/50 text-[11px] mb-2">৪. কত টাকা পাঠিয়েছেন লিখুন</p>
        <div className="flex gap-2 mb-2 flex-wrap">
          {QUICK_AMOUNTS.map((a) => (
            <button
              key={a}
              onClick={() => setAmount(String(a))}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${
                Number(amount) === a ? "bg-green-500 border-green-400 text-black" : "bg-white/5 border-white/10 text-white/70"
              }`}
            >
              ৳{a.toLocaleString()}
            </button>
          ))}
        </div>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="সরাসরি অ্যামাউন্ট লিখুন (ন্যূনতম ৳১০০)"
          className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-white text-sm outline-none focus:border-green-400/50 mb-4"
        />

        {/* Step 5: transaction id */}
        <p className="text-white/50 text-[11px] mb-2">৫. Transaction ID (TrxID) দিন</p>
        <input
          value={trxId}
          onChange={(e) => setTrxId(e.target.value.toUpperCase())}
          placeholder="যেমনঃ 8N7A2K9X"
          className={`w-full rounded-xl bg-white/5 border px-3 py-2.5 text-white text-sm outline-none mb-1 uppercase ${
            cleanTrxId.length > 0 && (!trxFormatValid || isDuplicate) ? "border-red-400/60" : "border-white/10 focus:border-green-400/50"
          }`}
        />
        {cleanTrxId.length > 0 && isDuplicate && (
          <p className="text-red-300 text-[10px] mb-3 flex items-center gap-1"><X size={11} /> এই TrxID আগেই ব্যবহার হয়েছে — ডাবল-ইউজ সনাক্ত হয়েছে</p>
        )}
        {cleanTrxId.length > 0 && !trxFormatValid && !isDuplicate && (
          <p className="text-red-300 text-[10px] mb-3">TrxID ৮-১০ ডিজিট/অক্ষরের হতে হবে</p>
        )}
        {(cleanTrxId.length === 0 || (trxFormatValid && !isDuplicate)) && <div className="mb-3" />}

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-400/30 px-3 py-2 mb-3 text-red-300 text-[11px] font-semibold">
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={status === "processing"}
          className={`w-full rounded-xl font-bold text-sm py-3 flex items-center justify-center gap-2 transition-all active:scale-95 ${
            canSubmit ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white" : "bg-white/10 text-white/30"
          }`}
        >
          {status === "processing" ? (
            <>
              <Loader2 size={16} className="animate-spin" /> যাচাই করা হচ্ছে (নাম্বার + TrxID)...
            </>
          ) : (
            "ডিপোজিট সাবমিট করুন"
          )}
        </button>
        <p className="text-white/30 text-[10px] text-center mt-2">সিস্টেম স্বয়ংক্রিয়ভাবে নাম্বার ফরম্যাট ও TrxID ডুপ্লিকেট যাচাই করবে</p>
      </div>
    </ScreenShell>
  );
}

/* ================= MESSAGE SECTION (list + full chat conversations) ================= */

const INITIAL_FRIEND_REQUESTS = [
  { id: "f1", name: "Rakib" },
  { id: "f2", name: "Mim" },
  { id: "f3", name: "Sabbir" },
];

const INITIAL_CHATS = [
  {
    id: "m1",
    name: "Tanvir",
    time: "2m",
    unread: 2,
    messages: [
      { from: "them", text: "ভাই কেমন আছিস?", time: "10:02" },
      { from: "them", text: "পরের রাউন্ডে খেলবি?", time: "10:03" },
    ],
  },
  {
    id: "m2",
    name: "Ayesha",
    time: "18m",
    unread: 0,
    messages: [
      { from: "me", text: "সেমি-ফাইনালে পৌঁছেছি 😄", time: "9:40" },
      { from: "them", text: "🔥🔥 তুমি ফাইনালে!", time: "9:44" },
    ],
  },
  {
    id: "m3",
    name: "Team StarBD",
    time: "1h",
    unread: 5,
    messages: [
      { from: "them", text: "নতুন টুর্নামেন্ট শুরু আজ রাতে", time: "9:00" },
      { from: "them", text: "রেজিস্ট্রেশন এখনই করুন!", time: "9:01" },
      { from: "them", text: "পুরস্কার: ৫০,০০০ কয়েন", time: "9:02" },
    ],
  },
  {
    id: "m4",
    name: "Nadia",
    time: "3h",
    unread: 0,
    messages: [
      { from: "me", text: "গেমটা জমজমাট ছিল", time: "7:10" },
      { from: "them", text: "গুড গেম 👍", time: "7:12" },
    ],
  },
];

function MessageScreen({ chats, onOpenChat, friendRequests, onAcceptFriend, onDeclineFriend, onNavigate }) {
  const [toast, setToast] = useState(null);
  const [query, setQuery] = useState("");

  function accept(f) {
    onAcceptFriend(f.id);
    setToast(`${f.name} এখন তোমার বন্ধু!`);
    setTimeout(() => setToast(null), 1600);
  }

  const filteredChats = chats.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <ScreenShell activeNav="message" onNavigate={onNavigate}>
      <ScreenHeader title="Message" onBack={() => onNavigate("home")} />

      <div className="px-4 w-full max-w-md mx-auto flex-1 pb-4">
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-2 mb-4">
          <Search size={14} className="text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="খুঁজুন..."
            className="bg-transparent outline-none text-white text-xs placeholder:text-white/30 flex-1"
          />
        </div>

        {friendRequests.length > 0 && (
          <>
            <p className="text-white/50 text-[11px] mb-2">ফ্রেন্ড রিকোয়েস্ট</p>
            <div className="flex gap-3 overflow-x-auto pb-3 mb-2">
              {friendRequests.map((f) => (
                <div key={f.id} className="flex flex-col items-center gap-1 shrink-0 w-16">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 border border-white/20 flex items-center justify-center text-white font-black text-sm">
                    {f.name[0]}
                  </div>
                  <span className="text-white text-[10px] truncate w-full text-center">{f.name}</span>
                  <div className="flex gap-1">
                    <button onClick={() => accept(f)} className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center active:scale-90">
                      <Check size={12} className="text-white" />
                    </button>
                    <button onClick={() => onDeclineFriend(f.id)} className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center active:scale-90">
                      <X size={12} className="text-white/70" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="text-white/50 text-[11px] mb-2">চ্যাট</p>
        <div className="flex flex-col gap-2 pb-4">
          {filteredChats.length === 0 && <p className="text-white/30 text-xs text-center py-6">কোনো চ্যাট পাওয়া যায়নি</p>}
          {filteredChats.map((c) => {
            const lastMsg = c.messages[c.messages.length - 1];
            return (
              <button
                key={c.id}
                onClick={() => onOpenChat(c.id)}
                className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-2.5 active:scale-[0.98] transition-transform text-left"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center text-white font-black text-sm shrink-0">
                  {c.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-white text-xs font-bold truncate">{c.name}</span>
                    <span className="text-white/40 text-[10px] shrink-0">{c.time}</span>
                  </div>
                  <span className="text-white/50 text-[11px] truncate block">
                    {lastMsg.from === "me" ? "তুমি: " : ""}
                    {lastMsg.text}
                  </span>
                </div>
                {c.unread > 0 && (
                  <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-cyan-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {c.unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-1">
          <Check size={14} /> {toast}
        </div>
      )}
    </ScreenShell>
  );
}

/* ================= CHAT DETAIL SCREEN (conversation view) ================= */

function ChatDetailScreen({ chat, onSend, onBack }) {
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages.length]);

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(chat.id, trimmed);
    setText("");
  }

  return (
    <div className="h-screen w-full relative flex flex-col overflow-x-hidden overflow-y-hidden bg-[#050818]">
      <div className="absolute inset-0 z-0 bg-gradient-to-br from-indigo-950/70 via-[#050818] to-black opacity-80" />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#050818]/60 via-[#050818]/20 to-[#050818] pointer-events-none" />

      <div className="relative z-10 flex flex-col flex-1">
        {/* chat header */}
        <div className="flex items-center gap-3 px-4 py-3 w-full max-w-md mx-auto border-b border-white/5">
          <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center active:scale-90 transition-transform shrink-0">
            <ChevronLeft size={18} className="text-white" />
          </button>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center text-white font-black text-xs shrink-0">
            {chat.name[0]}
          </div>
          <span className="text-white font-bold text-sm flex-1 truncate">{chat.name}</span>
        </div>

        {/* messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 w-full max-w-md mx-auto flex flex-col gap-2">
          {chat.messages.map((m, i) => (
            <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-xs ${
                  m.from === "me"
                    ? "bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-br-sm"
                    : "bg-white/10 text-white rounded-bl-sm"
                }`}
              >
                <span>{m.text}</span>
                <span className="block text-[9px] opacity-60 mt-1 text-right">{m.time}</span>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* input */}
        <div className="px-4 py-3 w-full max-w-md mx-auto flex items-center gap-2 border-t border-white/5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="মেসেজ লিখুন..."
            className="flex-1 rounded-full bg-white/5 border border-white/10 px-4 py-2.5 text-white text-xs outline-none focus:border-cyan-400/50"
          />
          <button
            onClick={send}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center active:scale-90 transition-transform shrink-0"
          >
            <ChevronRight size={18} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= NOTIFICATIONS SCREEN ================= */

const NOTIFS_TODAY = [
  { id: "n1", icon: Gift, color: "purple", title: "ডেইলি বোনাস রেডি", sub: "আজকের বোনাস সংগ্রহ করুন", time: "10m" },
  { id: "n2", icon: Trophy, color: "yellow", title: "সেমি-ফাইনালে পৌঁছেছেন!", sub: "টুর্নামেন্টে দুর্দান্ত পারফরম্যান্স", time: "1h" },
  { id: "n3", icon: UserPlus, color: "green", title: "রাকিব আপনার ফ্রেন্ড রিকোয়েস্ট গ্রহণ করেছে", sub: "", time: "3h" },
];
const NOTIFS_EARLIER = [
  { id: "n4", icon: Coins, color: "yellow", title: "১০,০০০ কয়েন যোগ হয়েছে", sub: "পেমেন্ট সফল হয়েছে", time: "গতকাল" },
  { id: "n5", icon: ShieldCheck, color: "cyan", title: "সিস্টেম মেইনটেন্যান্স", sub: "রাত ২টা - ৩টা পর্যন্ত সার্ভার বন্ধ থাকবে", time: "২ দিন আগে" },
];

function NotifRow({ n }) {
  const colors = {
    purple: "bg-purple-500/20 text-purple-300 border-purple-400/40",
    yellow: "bg-yellow-500/20 text-yellow-300 border-yellow-400/40",
    green: "bg-green-500/20 text-green-300 border-green-400/40",
    cyan: "bg-cyan-500/20 text-cyan-300 border-cyan-400/40",
  };
  const Icon = n.icon;
  return (
    <div className="flex items-start gap-3 rounded-xl bg-white/5 border border-white/10 p-2.5">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center border shrink-0 ${colors[n.color]}`}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-white text-xs font-bold block">{n.title}</span>
        {n.sub && <span className="text-white/50 text-[11px] block">{n.sub}</span>}
      </div>
      <span className="text-white/30 text-[10px] shrink-0">{n.time}</span>
    </div>
  );
}

function NotificationsScreen({ onNavigate }) {
  return (
    <ScreenShell activeNav="notifi" onNavigate={onNavigate}>
      <ScreenHeader title="Notifications" onBack={() => onNavigate("home")} />
      <div className="px-4 w-full max-w-md mx-auto flex-1">
        <p className="text-white/50 text-[11px] mb-2">আজ</p>
        <div className="flex flex-col gap-2 mb-4">
          {NOTIFS_TODAY.map((n) => <NotifRow key={n.id} n={n} />)}
        </div>
        <p className="text-white/50 text-[11px] mb-2">আগে</p>
        <div className="flex flex-col gap-2 pb-4">
          {NOTIFS_EARLIER.map((n) => <NotifRow key={n.id} n={n} />)}
        </div>
      </div>
    </ScreenShell>
  );
}

/* ================= SETTINGS SCREEN ================= */

function SettingsRow({ icon: Icon, label, right, onClick, danger }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3 active:scale-[0.98] transition-transform">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${danger ? "bg-red-500/20 text-red-300" : "bg-white/10 text-cyan-300"}`}>
        <Icon size={16} />
      </div>
      <span className={`flex-1 text-left text-xs font-bold ${danger ? "text-red-300" : "text-white"}`}>{label}</span>
      {right}
    </button>
  );
}

function SettingsScreen({ profile, onNavigate }) {
  const [sound, setSound] = useState(true);
  const [music, setMusic] = useState(true);
  const [vibration, setVibration] = useState(false);

  return (
    <ScreenShell activeNav="settings" onNavigate={onNavigate}>
      <ScreenHeader title="Settings" onBack={() => onNavigate("home")} />
      <div className="px-4 w-full max-w-md mx-auto flex-1 flex flex-col gap-4 pb-4">
        <GlassCard gradient="navy" className="p-3 flex items-center gap-3 cursor-pointer" interactive>
          <button onClick={() => onNavigate("profile")} className="flex items-center gap-3 w-full text-left">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 border-2 border-white/20 flex items-center justify-center text-white font-black">
              {profile.username[0]}
            </div>
            <div className="flex-1">
              <span className="text-white font-bold text-sm block">{profile.username}</span>
              <span className="text-cyan-300 text-[11px]">Level {profile.level}</span>
            </div>
            <ChevronRight size={16} className="text-white/40" />
          </button>
        </GlassCard>

        <div>
          <p className="text-white/50 text-[11px] mb-2">অ্যাকাউন্ট</p>
          <div className="flex flex-col gap-2">
            <SettingsRow icon={UserCog} label="প্রোফাইল এডিট করুন" right={<ChevronRight size={16} className="text-white/30" />} />
            <SettingsRow icon={ShieldCheck} label="পাসওয়ার্ড পরিবর্তন" right={<ChevronRight size={16} className="text-white/30" />} />
          </div>
        </div>

        <div>
          <p className="text-white/50 text-[11px] mb-2">প্রেফারেন্স</p>
          <div className="flex flex-col gap-2">
            <SettingsRow icon={Volume2} label="সাউন্ড ইফেক্ট" right={<Toggle checked={sound} onChange={setSound} />} />
            <SettingsRow icon={Music} label="মিউজিক" right={<Toggle checked={music} onChange={setMusic} />} />
            <SettingsRow icon={Vibrate} label="ভাইব্রেশন" right={<Toggle checked={vibration} onChange={setVibration} />} />
            <SettingsRow icon={Globe2} label="ভাষা" right={<span className="text-white/50 text-[11px]">বাংলা</span>} />
          </div>
        </div>

        <div>
          <p className="text-white/50 text-[11px] mb-2">সাপোর্ট</p>
          <div className="flex flex-col gap-2">
            <SettingsRow icon={HelpCircle} label="হেল্প সেন্টার" right={<ChevronRight size={16} className="text-white/30" />} />
            <SettingsRow icon={ShieldCheck} label="Terms & Privacy" right={<ChevronRight size={16} className="text-white/30" />} />
          </div>
        </div>

        <SettingsRow icon={LogOut} label="লগ আউট" danger />
      </div>
    </ScreenShell>
  );
}

/* ================= PROFILE SCREEN ================= */

const WIN_BREAKDOWN = [
  { label: "2 প্লেয়ার উইন", value: 45, icon: Users, color: "text-cyan-300 bg-cyan-500/15 border-cyan-400/30" },
  { label: "4 প্লেয়ার উইন", value: 45, icon: Swords, color: "text-purple-300 bg-purple-500/15 border-purple-400/30" },
  { label: "টুর্নামেন্ট উইন", value: 10, icon: Trophy, color: "text-yellow-300 bg-yellow-500/15 border-yellow-400/30" },
];

const STAGES_REACHED = [
  { label: "Knockout Stage", value: 5, icon: Flag },
  { label: "Quarter Final", value: 2, icon: Award },
  { label: "Semi Final", value: 2, icon: Trophy },
  { label: "Final", value: 1, icon: Crown },
];

function ProfileScreen({ profile, onNavigate }) {
  const totalWins = 100;
  const totalPlayed = 350;
  const winPct = Math.round((totalWins / totalPlayed) * 100);
  const maxStage = Math.max(...STAGES_REACHED.map((s) => s.value));

  return (
    <ScreenShell activeNav="home" onNavigate={onNavigate}>
      <ScreenHeader title="Profile" onBack={() => onNavigate("home")} />

      <div className="px-4 w-full max-w-md mx-auto flex-1 flex flex-col gap-4 pb-4">
        {/* Avatar + name */}
        <div className="flex flex-col items-center pt-2 pb-1">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-cyan-400 blur-xl opacity-40 scale-110" />
            <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 border-4 border-white/20 flex items-center justify-center text-3xl font-black text-white">
              {profile.username[0]}
            </div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-yellow-400 border-2 border-[#050818] flex items-center justify-center">
              <span className="text-[10px] font-black text-black">{profile.level}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            <span className="text-white font-black text-lg italic">{profile.username}</span>
            <span className="text-xl leading-none">🇧🇩</span>
          </div>
          <span className="text-cyan-300 text-xs font-semibold">Level {profile.level} Player</span>
        </div>

        {/* Total wins */}
        <GlassCard gradient="navy" className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-bold text-sm flex items-center gap-1.5">
              <Trophy size={15} className="text-yellow-300" /> Total Wins
            </span>
            <span className="text-white font-black text-sm">
              {totalWins} <span className="text-white/40 font-semibold">of {totalPlayed}</span>
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-yellow-400"
              style={{ width: `${winPct}%` }}
            />
          </div>
          <span className="text-white/40 text-[10px] mt-1 block">{winPct}% ম্যাচ জয়ের হার</span>
        </GlassCard>

        {/* Win breakdown */}
        <div>
          <p className="text-white/50 text-[11px] mb-2">জয়ের বিবরণ</p>
          <div className="grid grid-cols-3 gap-2">
            {WIN_BREAKDOWN.map((w) => {
              const Icon = w.icon;
              return (
                <div key={w.label} className={`rounded-xl border p-2.5 flex flex-col items-center gap-1 ${w.color}`}>
                  <Icon size={16} />
                  <span className="text-white font-black text-base leading-none">{w.value}</span>
                  <span className="text-[9px] text-center text-white/60 leading-tight">{w.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Played on / stages reached */}
        <div>
          <p className="text-white/50 text-[11px] mb-2">Played On — কোন স্টেজে কতবার উঠেছেন</p>
          <GlassCard gradient="navy" className="p-3 flex flex-col gap-3">
            {STAGES_REACHED.map((s) => {
              const Icon = s.icon;
              const widthPct = (s.value / maxStage) * 100;
              return (
                <div key={s.label} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <Icon size={14} className="text-cyan-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white text-[11px] font-semibold">{s.label}</span>
                      <span className="text-white font-black text-xs">{s.value}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${widthPct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </GlassCard>
        </div>
      </div>
    </ScreenShell>
  );
}

/* ================= RANKING SCREEN ================= */

const LEADERBOARD = [
  { rank: 1, name: "Shakil Ahmed", wins: 512, medal: "🥇" },
  { rank: 2, name: "Nusrat Jahan", wins: 478, medal: "🥈" },
  { rank: 3, name: "Rakib Hasan", wins: 440, medal: "🥉" },
  { rank: 4, name: "Tanvir Islam", wins: 390 },
  { rank: 5, name: "Mim Akter", wins: 355 },
  { rank: 6, name: "Player", wins: 100, me: true },
  { rank: 7, name: "Sabbir Khan", wins: 88 },
  { rank: 8, name: "Ayesha Siddika", wins: 76 },
];

function RankingScreen({ onNavigate }) {
  return (
    <ScreenShell activeNav="home" onNavigate={onNavigate}>
      <ScreenHeader title="Ranking" onBack={() => onNavigate("home")} />

      <div className="px-4 w-full max-w-md mx-auto flex-1 pb-4">
        {/* Top 3 — pyramid arrangement (1 on top, 2 below), uniform boxes, medal attached, name inline in caps */}
        <div className="flex flex-col gap-3 mb-6 mt-2">
          {/* rank 1 — top, centered */}
          <div className="w-full flex justify-center">
            <div className="w-[calc(50%-6px)] flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-2">
              <div className="relative w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 border-2 border-white/20 flex items-center justify-center text-white font-black text-base shrink-0">
                {LEADERBOARD[0].name[0]}
                <span className="absolute -top-2 -left-2 text-lg leading-none drop-shadow-md">{LEADERBOARD[0].medal}</span>
              </div>
              <span className="flex-1 text-white font-black uppercase tracking-wide text-sm truncate">{LEADERBOARD[0].name}</span>
              <span className="text-yellow-300 text-xs font-bold shrink-0">{LEADERBOARD[0].wins} 🏆</span>
            </div>
          </div>

          {/* rank 2 & 3 — below, side by side */}
          <div className="grid grid-cols-2 gap-3">
            {LEADERBOARD.slice(1, 3).map((p) => (
              <div key={p.rank} className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-2">
                <div className="relative w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 border-2 border-white/20 flex items-center justify-center text-white font-black text-base shrink-0">
                  {p.name[0]}
                  <span className="absolute -top-2 -left-2 text-lg leading-none drop-shadow-md">{p.medal}</span>
                </div>
                <span className="flex-1 text-white font-black uppercase tracking-wide text-sm truncate">{p.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between mb-2">
          <p className="text-white/50 text-[11px]">লিডারবোর্ড</p>
          <span className="text-white/30 text-[10px]">এই সপ্তাহ</span>
        </div>
        <div className="rounded-2xl overflow-hidden border border-white/10 divide-y divide-white/5">
          {LEADERBOARD.slice(3).map((p) => (
            <div
              key={p.rank}
              className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                p.me ? "bg-gradient-to-r from-cyan-500/20 to-transparent" : "bg-white/[0.02]"
              }`}
            >
              <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-black text-white/60 shrink-0">
                {p.rank}
              </span>
              <div className="relative w-10 h-10 rounded-lg bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center text-white font-black text-xs shrink-0 border border-white/10">
                {p.name[0]}
                {p.me && (
                  <span className="absolute -bottom-1 -right-1 bg-cyan-400 text-[#050818] text-[8px] font-black px-1 py-0.5 rounded-full leading-none">
                    YOU
                  </span>
                )}
              </div>
              <span className={`flex-1 uppercase text-xs font-bold truncate ${p.me ? "text-cyan-300" : "text-white"}`}>{p.name}</span>
              <span className="flex items-center gap-1 bg-yellow-400/10 border border-yellow-400/20 rounded-full px-2 py-1 text-yellow-300 text-[11px] font-bold shrink-0">
                🏆 {p.wins}
              </span>
            </div>
          ))}
        </div>
      </div>
    </ScreenShell>
  );
}

/* ================= DAILY BONUS SCREEN (7-day streak) ================= */

const DAILY_BONUS = [100, 200, 300, 400, 500, 600, 700];

function DailyBonusScreen({ profile, streak, onClaim, onNavigate }) {
  const { day, claimedToday } = streak;
  const todayAmount = DAILY_BONUS[day - 1];

  return (
    <ScreenShell activeNav="home" onNavigate={onNavigate}>
      <ScreenHeader title="Daily Bonus" onBack={() => onNavigate("home")} />

      <div className="px-4 w-full max-w-md mx-auto flex-1 pb-4">
        <div className="rounded-xl bg-black/40 border border-yellow-400/30 px-3 py-2 flex items-center justify-between mb-4">
          <span className="text-yellow-300 text-xs font-bold">🪙 কয়েন ব্যালেন্স</span>
          <span className="text-white font-black text-sm">{profile.coins.toLocaleString()}</span>
        </div>

        <p className="text-white/50 text-[11px] mb-3">
          প্রতিদিন লগইন করলে বোনাস বাড়তে থাকবে। কোনো একদিন না খেললে পরের দিন থেকে আবার ১ম দিন থেকে শুরু হবে।
        </p>

        <div className="grid grid-cols-4 gap-2 mb-6">
          {DAILY_BONUS.map((amount, i) => {
            const dayNum = i + 1;
            const isPast = dayNum < day || (dayNum === day && claimedToday);
            const isCurrent = dayNum === day && !claimedToday;
            const isLocked = dayNum > day;
            return (
              <div
                key={dayNum}
                className={`rounded-xl border p-2 flex flex-col items-center gap-1 ${
                  isCurrent
                    ? "bg-gradient-to-b from-yellow-400/20 to-transparent border-yellow-400/60 shadow-[0_0_14px_rgba(250,204,21,0.3)] scale-[1.03]"
                    : isPast
                    ? "bg-white/5 border-white/10 opacity-60"
                    : "bg-white/5 border-white/5 opacity-40"
                }`}
              >
                <span className="text-white/50 text-[9px] font-bold">Day {dayNum}</span>
                <span className="text-lg leading-none">{isPast ? "✅" : isLocked ? "🔒" : "🪙"}</span>
                <span className={`text-[10px] font-black ${isCurrent ? "text-yellow-300" : "text-white/60"}`}>{amount}</span>
              </div>
            );
          })}
        </div>

        <button
          onClick={onClaim}
          disabled={claimedToday}
          className={`w-full rounded-xl font-bold text-sm py-3 flex items-center justify-center gap-2 transition-all active:scale-95 ${
            claimedToday ? "bg-white/10 text-white/30" : "bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white shadow-[0_0_16px_rgba(168,85,247,0.4)]"
          }`}
        >
          <Gift size={16} /> {claimedToday ? "আজকের বোনাস নেওয়া হয়ে গেছে" : `Day ${day} বোনাস নিন (+${todayAmount} কয়েন)`}
        </button>
      </div>
    </ScreenShell>
  );
}

/* ================= INVITE & EARN SCREEN ================= */

function InviteScreen({ onNavigate }) {
  const [inviteCode] = useState(() => Math.random().toString(36).slice(2, 10).toUpperCase());
  const [copied, setCopied] = useState(false);

  function copyCode() {
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <ScreenShell activeNav="home" onNavigate={onNavigate}>
      <ScreenHeader title="Invite & Earn" onBack={() => onNavigate("home")} />

      <div className="px-4 w-full max-w-md mx-auto flex-1 pb-4">
        {/* invite code card */}
        <GlassCard gradient="dark" className="p-4 mb-5 text-center">
          <p className="text-white/50 text-[11px] mb-1">তোমার ইনভাইট কোড</p>
          <span className="text-yellow-300 font-black text-2xl tracking-widest">{inviteCode}</span>
          <button
            onClick={copyCode}
            className="mt-3 w-full rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 text-[#050818] font-bold text-xs py-2 flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
          >
            <Copy size={13} /> {copied ? "কপি হয়েছে!" : "কোড কপি করুন"}
          </button>
        </GlassCard>

        {/* what you earn */}
        <p className="text-white/50 text-[11px] mb-2">তুমি যা পাবে</p>
        <div className="rounded-xl bg-purple-500/10 border border-purple-400/30 p-3 flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center border border-purple-400/40 shrink-0">
            <Gift className="text-purple-300" size={18} />
          </div>
          <div>
            <span className="text-white font-black text-sm block">১০০ কয়েন</span>
            <span className="text-white/50 text-[11px]">শুধুমাত্র বন্ধু তোমার লিংক দিয়ে অ্যাকাউন্ট খুললে এই বোনাস পাবে — লিংক ছাড়া অ্যাকাউন্ট খুললে পাবে না</span>
          </div>
        </div>

        {/* new user tiers */}
        <p className="text-white/50 text-[11px] mb-2">নতুন ইউজার যা পাবে</p>
        <div className="flex flex-col gap-2 mb-2">
          <div className="rounded-xl bg-green-500/10 border border-green-400/30 p-3 flex items-center gap-3">
            <span className="text-lg">🔗</span>
            <div className="flex-1">
              <span className="text-white text-xs font-bold block">ইনভাইট লিংক দিয়ে অ্যাকাউন্ট খুললে</span>
            </div>
            <span className="text-green-300 font-black text-sm shrink-0">4,000</span>
          </div>
          <div className="rounded-xl bg-cyan-500/10 border border-cyan-400/30 p-3 flex items-center gap-3">
            <span className="text-lg">🧾</span>
            <div className="flex-1">
              <span className="text-white text-xs font-bold block">রেফারেন্স নাম্বার ছাড়া অ্যাকাউন্ট খুললে</span>
            </div>
            <span className="text-cyan-300 font-black text-sm shrink-0">3,000</span>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center gap-3">
            <span className="text-lg">👤</span>
            <div className="flex-1">
              <span className="text-white text-xs font-bold block">অ্যাকাউন্ট ছাড়া গেস্ট হিসেবে খেললে</span>
            </div>
            <span className="text-white/60 font-black text-sm shrink-0">2,000</span>
          </div>
        </div>
        <p className="text-white/30 text-[10px]">* সব বোনাসেই শর্ত প্রযোজ্য</p>
      </div>
    </ScreenShell>
  );
}

/* ================= APP ROOT ================= */

export default function Home() {
  const [screen, setScreen] = useState("home");
  const [profile, setProfile] = useState({ username: "Player", level: 1, coins: 12200, cash: 4000 });
  const [streak, setStreak] = useState({ day: 1, claimedToday: false });
  const [usedTrxIds, setUsedTrxIds] = useState(["8N7A2K9X", "TEST1234"]); // demo: pre-used IDs to show duplicate detection
  const [chats, setChats] = useState(INITIAL_CHATS);
  const [friendRequests, setFriendRequests] = useState(INITIAL_FRIEND_REQUESTS);
  const [activeChatId, setActiveChatId] = useState(null);

  function handleBuyCoins(amount, price) {
    setProfile((p) => ({ ...p, coins: p.coins + amount, cash: p.cash - price }));
  }

  function handleDepositCash(amount, trxId) {
    setProfile((p) => ({ ...p, cash: p.cash + amount }));
    if (trxId) setUsedTrxIds((ids) => [...ids, trxId]);
  }

  function handleClaimDaily() {
    if (streak.claimedToday) return;
    const amount = DAILY_BONUS[streak.day - 1];
    setProfile((p) => ({ ...p, coins: p.coins + amount }));
    setStreak((s) => ({ day: s.day, claimedToday: true }));
  }

  function openChat(chatId) {
    setChats((cs) => cs.map((c) => (c.id === chatId ? { ...c, unread: 0 } : c)));
    setActiveChatId(chatId);
    setScreen("chat");
  }

  function sendMessage(chatId, text) {
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    setChats((cs) => cs.map((c) => (c.id === chatId ? { ...c, messages: [...c.messages, { from: "me", text, time }] } : c)));
  }

  function acceptFriend(id) {
    setFriendRequests((fr) => fr.filter((f) => f.id !== id));
  }

  function declineFriend(id) {
    setFriendRequests((fr) => fr.filter((f) => f.id !== id));
  }

  if (screen === "store") return <StoreScreen profile={profile} onNavigate={setScreen} onBuy={handleBuyCoins} />;
  if (screen === "deposit") return <DepositScreen profile={profile} onNavigate={setScreen} onDeposit={handleDepositCash} usedTrxIds={usedTrxIds} />;
  if (screen === "message")
    return (
      <MessageScreen
        chats={chats}
        onOpenChat={openChat}
        friendRequests={friendRequests}
        onAcceptFriend={acceptFriend}
        onDeclineFriend={declineFriend}
        onNavigate={setScreen}
      />
    );
  if (screen === "chat") {
    const chat = chats.find((c) => c.id === activeChatId);
    return <ChatDetailScreen chat={chat} onSend={sendMessage} onBack={() => setScreen("message")} />;
  }
  if (screen === "notifi") return <NotificationsScreen onNavigate={setScreen} />;
  if (screen === "settings") return <SettingsScreen profile={profile} onNavigate={setScreen} />;
  if (screen === "profile") return <ProfileScreen profile={profile} onNavigate={setScreen} />;
  if (screen === "ranking") return <RankingScreen onNavigate={setScreen} />;
  if (screen === "daily") return <DailyBonusScreen profile={profile} streak={streak} onClaim={handleClaimDaily} onNavigate={setScreen} />;
  if (screen === "invite") return <InviteScreen onNavigate={setScreen} />;

  return (
    <HomeScreen
      profile={profile}
      onNavigate={setScreen}
      onPlusCoins={() => setScreen("store")}
      onPlusCash={() => setScreen("deposit")}
      dailyClaimed={streak.claimedToday}
    />
  );
}
