import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { Navbar } from '../components/Navbar.js';
import { MetricCards } from '../components/MetricCards.js';
import { ScheduledEmailsTable } from '../components/ScheduledEmailsTable.js';
import { SentEmailsTable } from '../components/SentEmailsTable.js';
import { ComposeModal } from '../components/ComposeModal.js';
import { Clock, CheckCircle2 } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>('scheduled');
  const [isComposeOpen, setIsComposeOpen] = useState(false);

  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.campaigns.getStats(),
    refetchInterval: 5000,
  });

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col">
      <Navbar onOpenCompose={() => setIsComposeOpen(true)} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {/* Metric Cards */}
        <MetricCards stats={stats} isLoading={isStatsLoading} />

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mb-6 border-b border-[#222E46] pb-3">
          <button
            onClick={() => setActiveTab('scheduled')}
            id="scheduled-emails-tab"
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition ${
              activeTab === 'scheduled'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Scheduled Emails</span>
            {stats && stats.totalScheduled > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] bg-white/20 text-white font-bold">
                {stats.totalScheduled}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('sent')}
            id="sent-emails-tab"
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition ${
              activeTab === 'sent'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Sent Emails</span>
            {stats && stats.totalSent > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] bg-white/20 text-white font-bold">
                {stats.totalSent}
              </span>
            )}
          </button>
        </div>

        {/* Tab View */}
        {activeTab === 'scheduled' ? (
          <ScheduledEmailsTable onOpenCompose={() => setIsComposeOpen(true)} />
        ) : (
          <SentEmailsTable />
        )}
      </main>

      {/* Compose Email Modal */}
      <ComposeModal isOpen={isComposeOpen} onClose={() => setIsComposeOpen(false)} />
    </div>
  );
};
