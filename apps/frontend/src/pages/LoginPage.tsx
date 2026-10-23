import React from 'react';
import { Send, CheckCircle2, Shield, Zap, RefreshCw, KeyRound } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  const urlParams = new URLSearchParams(window.location.search);
  const errorParam = urlParams.get('error');

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background radial gradients */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full relative z-10">
        <div className="bg-[#131927] border border-[#222E46] rounded-3xl p-8 shadow-2xl backdrop-blur-xl">
          {/* Logo & Heading */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 mx-auto flex items-center justify-center shadow-xl shadow-indigo-600/30 mb-4">
              <Send className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">InboxPilot</h1>
            <p className="text-xs text-slate-400 mt-1.5 font-medium">
              ReachInbox Hiring Assignment — Persistent Email Scheduler
            </p>
          </div>

          {/* Error notice if redirected with OAuth error */}
          {errorParam && (
            <div className="mb-6 p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
              <strong>Authentication notice:</strong> {decodeURIComponent(errorParam)}
            </div>
          )}

          {/* Features highlight */}
          <div className="space-y-3 mb-8 bg-[#0B0F19]/60 p-4 rounded-2xl border border-[#222E46]/80 text-xs text-slate-300">
            <div className="flex items-center gap-2.5">
              <Zap className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <span>Real BullMQ delayed scheduling backed by persistent Redis</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Strict DB idempotency & crash recovery guarantees</span>
            </div>
            <div className="flex items-center gap-2.5">
              <RefreshCw className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>Distributed sliding-window per-sender hourly rate limiting</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <span>Ethereal SMTP with test preview inspection URLs</span>
            </div>
          </div>

          {/* Real Google OAuth Button */}
          <button
            onClick={handleGoogleLogin}
            id="google-login-btn"
            className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-3 shadow-lg hover:shadow-xl active:scale-[0.98]"
          >
            {/* Official Google 'G' icon */}
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.04h3.88c2.27-2.09 3.66-5.17 3.66-9.14z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.04c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.13C3.26 21.36 7.36 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.28c-.25-.72-.38-1.49-.38-2.28s.13-1.56.38-2.28V6.59H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.41l4.03-3.13z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.59l4.03 3.13c.95-2.83 3.6-4.97 6.72-4.97z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          {/* Setup note */}
          <div className="mt-6 p-3 rounded-xl bg-slate-900/60 border border-[#222E46] text-[11px] text-slate-400 flex items-start gap-2">
            <KeyRound className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
            <span>
              Google OAuth credentials configured via <code className="text-slate-300 font-mono">GOOGLE_CLIENT_ID</code> and <code className="text-slate-300 font-mono">GOOGLE_CLIENT_SECRET</code> in server environment.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
