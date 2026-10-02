"use client";

import React, { useState, useEffect } from "react";
import { getBrowserSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bed,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  HeartPulse,
  Activity,
  Shield,
  Zap,
  ArrowRight,
  UserPlus,
} from "lucide-react";

type AuthMode = "login" | "signup";
type UserRole = "dispatcher" | "nurse" | "coordinator" | "admin";

const ROLE_OPTIONS: { value: UserRole; label: string; desc: string; icon: string }[] = [
  { value: "dispatcher", label: "EMS Dispatcher", desc: "Ambulance routing & emergency triage", icon: "🚑" },
  { value: "nurse", label: "Floor Nurse", desc: "Bedside triage & emergency hold decisions", icon: "👩‍⚕️" },
  { value: "coordinator", label: "Bed Coordinator", desc: "Hospital capacity & ward management", icon: "🏥" },
  { value: "admin", label: "Admin", desc: "Full system access", icon: "🛡️" },
];

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/";

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("nurse");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    setConfigured(isSupabaseConfigured());
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const supabase = getBrowserSupabaseClient();
    if (!supabase) {
      setError("Supabase not configured. Add your credentials to .env.local");
      setLoading(false);
      return;
    }

    try {
      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        router.push(redirectTo);
        router.refresh();
      } else {
        // Sign up + create profile
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (signUpError) throw signUpError;

        if (data.user) {
          // Upsert profile row
          await supabase.from("profiles").upsert({
            id: data.user.id,
            name,
            role,
          });
        }

        setSuccess(
          "Account created! Check your email to confirm, then log in."
        );
        setMode("login");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An error occurred";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-slate-950">
      {/* Left Panel — Brand Hero */}
      <div className="hidden lg:flex flex-col justify-between w-[52%] bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 p-12 relative overflow-hidden">
        {/* Background grid pattern */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        {/* Glowing orbs */}
        <div className="absolute top-20 right-20 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-32 left-10 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Bed className="w-7 h-7 text-white" />
          </div>
          <div>
            <span className="text-2xl font-black text-white tracking-tight">BedLink</span>
            <span className="text-xs text-blue-300 font-semibold block -mt-0.5">EMS Coordination Platform</span>
          </div>
        </div>

        {/* Hero copy */}
        <div className="relative z-10">
          <h1 className="text-5xl font-black text-white leading-tight mb-6">
            Real-Time
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-cyan-300">
              Emergency Bed
            </span>
            <br />
            Coordination.
          </h1>
          <p className="text-blue-200 text-lg leading-relaxed mb-10 max-w-md">
            Connecting paramedics, dispatchers, and hospital staff across Mumbai — every
            bed update instantly visible across all devices.
          </p>

          {/* Feature pills */}
          <div className="flex flex-col gap-3">
            {[
              { icon: <Activity className="w-4 h-4" />, text: "Live bed counts across all hospitals" },
              { icon: <HeartPulse className="w-4 h-4" />, text: "SHA-256 sealed patient handover records" },
              { icon: <Shield className="w-4 h-4" />, text: "Role-based access — Nurse, Dispatcher, Admin" },
              { icon: <Zap className="w-4 h-4" />, text: "Sub-second Supabase Realtime sync" },
            ].map(({ icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-300 shrink-0">
                  {icon}
                </div>
                <span className="text-sm text-blue-100 font-medium">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom badge */}
        <div className="relative z-10">
          <span className="text-xs text-blue-400 font-semibold uppercase tracking-wider">
            Mumbai 108 EMS · Brihanmumbai Healthcare Network
          </span>
        </div>
      </div>

      {/* Right Panel — Auth Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center">
              <Bed className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-black text-white">BedLink</span>
          </div>

          {/* Card */}
          <div className="bg-slate-900 rounded-3xl border border-slate-800 p-8 shadow-2xl shadow-black/40">
            {/* Mode toggle */}
            <div className="flex bg-slate-800/60 rounded-xl p-1 mb-8 border border-slate-700/50">
              {(["login", "signup"] as AuthMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(null); setSuccess(null); }}
                  className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all capitalize ${
                    mode === m
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {m === "login" ? "Sign In" : "Create Account"}
                </button>
              ))}
            </div>

            <div className="mb-6">
              <h2 className="text-2xl font-black text-white">
                {mode === "login" ? "Welcome back" : "Join BedLink"}
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                {mode === "login"
                  ? "Sign in to your operator account"
                  : "Create your EMS operator account"}
              </p>
            </div>

            {/* Not configured warning */}
            {!configured && (
              <div className="mb-5 p-3 bg-amber-900/30 border border-amber-700/40 rounded-xl flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300">
                  Supabase not configured. Add <code className="bg-amber-900/50 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="bg-amber-900/50 px-1 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code className="bg-amber-900/50 px-1 rounded">.env.local</code>
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name (signup only) */}
              {mode === "signup" && (
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required={mode === "signup"}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dr. / Paramedic name"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-all"
                  />
                </div>
              )}

              {/* Email */}
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@hospital.gov.in"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-12 py-3 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-all"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Role (signup only) */}
              {mode === "signup" && (
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Your Role
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setRole(opt.value)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          role === opt.value
                            ? "bg-blue-600/20 border-blue-500/60 text-blue-200"
                            : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:border-slate-600"
                        }`}
                      >
                        <span className="text-base block mb-0.5">{opt.icon}</span>
                        <span className="text-xs font-bold block">{opt.label}</span>
                        <span className="text-[10px] opacity-70 block leading-tight">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2.5 p-3 bg-red-900/30 border border-red-700/40 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">{error}</p>
                </div>
              )}

              {/* Success */}
              {success && (
                <div className="flex items-start gap-2.5 p-3 bg-emerald-900/30 border border-emerald-700/40 rounded-xl">
                  <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-300">{success}</p>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !configured}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 group mt-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : mode === "login" ? (
                  <>
                    <span>Sign In to BedLink</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Create Account</span>
                  </>
                )}
              </button>
            </form>

            {mode === "login" && (
              <p className="text-center text-xs text-slate-500 mt-5">
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => { setMode("signup"); setError(null); }}
                  className="text-blue-400 hover:text-blue-300 font-semibold transition-colors"
                >
                  Create one
                </button>
              </p>
            )}
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-slate-600 mt-6">
            BedLink EMS Platform · Mumbai 108 Emergency Network
          </p>
        </div>
      </div>
    </div>
  );
}
