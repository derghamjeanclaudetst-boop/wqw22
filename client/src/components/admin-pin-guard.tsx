import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Delete, ShieldAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSystemSettings } from "@/contexts/system-settings";

const SESSION_KEY = "admin_tools_unlocked_at";
const SESSION_TTL = 4 * 60 * 60 * 1000; // 4 hours
const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60;

function isUnlocked(): boolean {
  try {
    const ts = Number(sessionStorage.getItem(SESSION_KEY) || 0);
    return Date.now() - ts < SESSION_TTL;
  } catch { return false; }
}

function setUnlocked() {
  try { sessionStorage.setItem(SESSION_KEY, String(Date.now())); } catch {}
}

function clearUnlocked() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

type PinStatus = { hasPIN: boolean };

export function AdminPinGuard({ children }: { children: React.ReactNode }) {
  const { systemName, logoUrl } = useSystemSettings();
  const [unlocked, setUnlockedState] = useState(isUnlocked);

  const { data: pinStatus, isLoading } = useQuery<PinStatus>({
    queryKey: ["/api/settings/admin-pin/status"],
    staleTime: 30_000,
  });

  const [digits, setDigits] = useState("");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [shake, setShake] = useState(false);

  // Lockout countdown
  useEffect(() => {
    if (lockoutUntil <= Date.now()) return;
    const interval = setInterval(() => {
      const rem = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (rem <= 0) { setLockoutRemaining(0); clearInterval(interval); }
      else setLockoutRemaining(rem);
    }, 500);
    setLockoutRemaining(Math.ceil((lockoutUntil - Date.now()) / 1000));
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 600);
  }, []);

  const verify = useCallback(async (pin: string) => {
    if (verifying) return;
    setVerifying(true);
    try {
      const res = await fetch("/api/settings/admin-pin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        setUnlocked(true);
        setUnlockedState(true);
        setDigits("");
        setError("");
        setAttempts(0);
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setDigits("");
        triggerShake();
        if (newAttempts >= MAX_ATTEMPTS) {
          const until = Date.now() + LOCKOUT_SECONDS * 1000;
          setLockoutUntil(until);
          setError(`Too many attempts. Locked for ${LOCKOUT_SECONDS} seconds.`);
        } else {
          setError(`Incorrect PIN. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts !== 1 ? "s" : ""} remaining.`);
        }
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setVerifying(false);
    }
  }, [verifying, attempts, triggerShake]);

  const press = useCallback((d: string) => {
    if (lockoutRemaining > 0) return;
    if (digits.length >= 8) return;
    const next = digits + d;
    setDigits(next);
    setError("");
    if (next.length >= 6) {
      verify(next);
    }
  }, [digits, lockoutRemaining, verify]);

  const backspace = useCallback(() => {
    setDigits(p => p.slice(0, -1));
    setError("");
  }, []);

  const handleUnlock = useCallback(() => {
    if (digits.length >= 4) verify(digits);
  }, [digits, verify]);

  // Keyboard support
  useEffect(() => {
    if (unlocked || isLoading || !pinStatus?.hasPIN) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") press(e.key);
      else if (e.key === "Backspace") backspace();
      else if (e.key === "Enter" && digits.length >= 4) handleUnlock();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [unlocked, isLoading, pinStatus, press, backspace, handleUnlock, digits]);

  // If loading or no PIN set, pass through
  if (isLoading) return <>{children}</>;
  if (!pinStatus?.hasPIN || unlocked) return <>{children}</>;

  const isLocked = lockoutRemaining > 0;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 relative">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)", backgroundSize: "32px 32px" }} />

      <div className={`relative z-10 w-full max-w-sm mx-auto px-4 transition-transform duration-100 ${shake ? "animate-[shake_0.5s_ease-in-out]" : ""}`}>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center shadow-2xl ring-4 ring-blue-500/20 mb-4 overflow-hidden">
            {logoUrl
              ? <img src={logoUrl} alt="logo" className="w-10 h-10 object-contain" />
              : <Lock className="h-8 w-8 text-white" />}
          </div>
          <h1 className="text-2xl font-bold text-white">{systemName}</h1>
          <p className="text-slate-400 text-sm mt-1 flex items-center justify-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" /> Admin Tools — Enter PIN to continue
          </p>
        </div>

        {/* PIN dots */}
        <div className="flex justify-center gap-3 mb-6">
          {Array.from({ length: Math.max(4, digits.length) }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                i < digits.length
                  ? "bg-blue-400 border-blue-400 scale-110"
                  : "border-slate-600 bg-transparent"
              }`}
            />
          ))}
        </div>

        {/* Error / lockout */}
        <div className="h-8 flex items-center justify-center mb-4">
          {isLocked ? (
            <p className="text-red-400 text-sm flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" /> Locked — try again in {lockoutRemaining}s
            </p>
          ) : error ? (
            <p className="text-red-400 text-sm text-center">{error}</p>
          ) : null}
        </div>

        {/* Number pad */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {["1","2","3","4","5","6","7","8","9"].map(d => (
            <button
              key={d}
              onClick={() => press(d)}
              disabled={isLocked || verifying}
              className="h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white text-2xl font-semibold transition-all duration-100 border border-slate-700 hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
            >
              {d}
            </button>
          ))}

          {/* Bottom row: backspace, 0, unlock */}
          <button
            onClick={backspace}
            disabled={isLocked || verifying || digits.length === 0}
            className="h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 transition-all duration-100 border border-slate-700 hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shadow-lg"
          >
            <Delete className="h-6 w-6" />
          </button>
          <button
            onClick={() => press("0")}
            disabled={isLocked || verifying}
            className="h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white text-2xl font-semibold transition-all duration-100 border border-slate-700 hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
          >
            0
          </button>
          <button
            onClick={handleUnlock}
            disabled={isLocked || verifying || digits.length < 4}
            className="h-16 rounded-2xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-bold transition-all duration-100 border border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center shadow-lg shadow-blue-900/40"
          >
            {verifying ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : "Enter"}
          </button>
        </div>

        {/* Lock tip */}
        <p className="text-center text-slate-600 text-xs mt-4">
          Session stays unlocked for 4 hours · <button
            onClick={() => { clearUnlocked(); setUnlockedState(false); }}
            className="text-slate-500 hover:text-slate-300 underline transition-colors"
          >Lock now</button>
        </p>
      </div>

      {/* Shake keyframe */}
      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          15%{transform:translateX(-8px)}
          30%{transform:translateX(8px)}
          45%{transform:translateX(-6px)}
          60%{transform:translateX(6px)}
          75%{transform:translateX(-4px)}
          90%{transform:translateX(4px)}
        }
      `}</style>
    </div>
  );
}

export function lockAdminTools() {
  clearUnlocked();
}
