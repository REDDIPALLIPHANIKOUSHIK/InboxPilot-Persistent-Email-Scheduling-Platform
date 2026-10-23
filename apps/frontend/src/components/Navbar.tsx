import React from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Send, LogOut, Plus, ShieldCheck } from 'lucide-react';

interface NavbarProps {
  onOpenCompose: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenCompose }) => {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 bg-[#0B0F19]/90 backdrop-blur-md border-b border-[#222E46] px-6 py-3.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Send className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight text-white">InboxPilot</span>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                ReachInbox Engine
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Persistent Distributed Email Scheduler
            </p>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-4">
          <button
            onClick={onOpenCompose}
            id="compose-email-btn"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-indigo-600/30 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Compose Email</span>
          </button>

          {user && (
            <div className="flex items-center gap-3 pl-3 border-l border-[#222E46]">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-9 h-9 rounded-full ring-2 ring-indigo-500/30 object-cover"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-slate-800 border border-[#222E46] flex items-center justify-center font-semibold text-xs text-indigo-400">
                  {user.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="hidden md:block text-left text-xs">
                <div className="font-medium text-white flex items-center gap-1">
                  {user.name}
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-slate-400 truncate max-w-[150px]">{user.email}</div>
              </div>
              <button
                onClick={logout}
                title="Sign out"
                id="logout-btn"
                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
