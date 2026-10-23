import React, { useState } from 'react';
import { Send, CheckCircle2, Shield, Zap, RefreshCw, KeyRound, Settings, Check, Play, AlertCircle } from 'lucide-react';
import { getApiBaseUrl } from '../services/api.js';
import { useAuth } from '../context/AuthContext.js';
import { useNavigate } from 'react-router-dom';

export const LoginPage: React.FC = () => {
  const { loginDemoUser } = useAuth();
  const navigate = useNavigate();
  const [showConfig, setShowConfig] = useState(false);
  const [customApiUrl, setCustomApiUrl] = useState(() => {
    return localStorage.getItem('inboxpilot_custom_api_url') || import.meta.env.VITE_API_BASE_URL || '';
  });
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [oauthErrorNotice, setOauthErrorNotice] = useState<string | null>(null);

  const currentBaseUrl = getApiBaseUrl();

  const handleGoogleLogin = async () => {
    // Check if backend is reachable
    try {
      const res = await fetch(`${currentBaseUrl}/health`, { signal: AbortSignal.timeout(2500) });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        // Backend is healthy, proceed with real Google OAuth flow
        window.location.href = `${currentBaseUrl}/auth/google`;
        return;
      }
    } catch {}

    // Backend is not reachable (e.g. running on Vercel standalone without persistent Node server)
    setOauthErrorNotice(
      `Backend API is currently unreachable at "${currentBaseUrl}". For live BullMQ workers, connect a running backend server below, or click "Explore Interactive Dashboard" to test the UI & scheduling immediately.`
    );
  };

  const handleEnterDemo = () => {
    loginDemoUser();
    navigate('/');
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (customApiUrl.trim()) {
      localStorage.setItem('inboxpilot_custom_api_url', customApiUrl.trim());
    } else {
      localStorage.removeItem('inboxpilot_custom_api_url');
    }
    setSavedSuccess(true);
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  const urlParams = new URLSearchParams(window.location.search);
  const errorParam = urlParams.get('error') || oauthErrorNotice;

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

          {/* Error notice if redirected with OAuth error or backend notice */}
          {errorParam && (
            <div className="mb-6 p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Notice:</strong> {decodeURIComponent(errorParam)}
              </div>
            </div>
          )}

          {/* Features highlight */}
          <div className="space-y-3 mb-6 bg-[#0B0F19]/60 p-4 rounded-2xl border border-[#222E46]/80 text-xs text-slate-300">
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

          <div className="space-y-3">
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

            {/* Interactive Demo / UI Preview Button */}
            <button
              onClick={handleEnterDemo}
              id="enter-demo-btn"
              className="w-full py-3 px-4 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-semibold text-xs transition flex items-center justify-center gap-2"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Explore Interactive Dashboard (Preview Mode)</span>
            </button>
          </div>

          {/* Setup note */}
          <div className="mt-5 p-3 rounded-xl bg-slate-900/60 border border-[#222E46] text-[11px] text-slate-400 flex items-start gap-2">
            <KeyRound className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
            <span>
              Real Google OAuth requires backend running with <code className="text-slate-300 font-mono">GOOGLE_CLIENT_ID</code> and <code className="text-slate-300 font-mono">GOOGLE_CLIENT_SECRET</code>.
            </span>
          </div>

          {/* Backend Connection Indicator & Settings Toggle */}
          <div className="mt-4 pt-3 border-t border-[#222E46]/60 text-[11px] text-slate-400">
            <div className="flex items-center justify-between">
              <span className="truncate max-w-[240px]">
                API: <code className="text-indigo-400 font-mono">{currentBaseUrl}</code>
              </span>
              <button
                type="button"
                onClick={() => setShowConfig(!showConfig)}
                className="flex items-center gap-1 text-slate-400 hover:text-white transition"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Configure</span>
              </button>
            </div>

            {showConfig && (
              <form onSubmit={handleSaveConfig} className="mt-3 p-3 bg-[#0B0F19] rounded-xl border border-[#222E46] space-y-2">
                <label className="block text-slate-300 font-medium text-[11px]">
                  Backend API Base URL
                </label>
                <input
                  type="text"
                  placeholder="e.g. http://localhost:5000 or https://api.yourdomain.com"
                  value={customApiUrl}
                  onChange={(e) => setCustomApiUrl(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-[#131927] border border-[#222E46] rounded-lg text-white font-mono text-[11px] focus:outline-none focus:border-indigo-500"
                />
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500">
                    Saved in browser localStorage
                  </span>
                  <button
                    type="submit"
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-medium flex items-center gap-1 transition"
                  >
                    {savedSuccess ? <Check className="w-3 h-3" /> : null}
                    <span>Save & Reload</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
