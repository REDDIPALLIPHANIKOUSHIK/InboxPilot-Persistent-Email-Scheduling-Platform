import React from 'react';
import { DashboardStatsDto } from '@inboxpilot/shared';
import { Clock, CheckCircle2, AlertTriangle, Users } from 'lucide-react';

interface MetricCardsProps {
  stats?: DashboardStatsDto;
  isLoading: boolean;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ stats, isLoading }) => {
  const cards = [
    {
      title: 'Scheduled Emails',
      value: stats?.totalScheduled ?? 0,
      icon: Clock,
      color: 'from-amber-500/20 to-orange-500/5',
      borderColor: 'border-amber-500/30',
      iconColor: 'text-amber-400',
    },
    {
      title: 'Successfully Sent',
      value: stats?.totalSent ?? 0,
      icon: CheckCircle2,
      color: 'from-emerald-500/20 to-teal-500/5',
      borderColor: 'border-emerald-500/30',
      iconColor: 'text-emerald-400',
    },
    {
      title: 'Delivery Failures',
      value: stats?.totalFailed ?? 0,
      icon: AlertTriangle,
      color: 'from-rose-500/20 to-red-500/5',
      borderColor: 'border-rose-500/30',
      iconColor: 'text-rose-400',
    },
    {
      title: 'Active Senders',
      value: stats?.activeSenders ?? 0,
      icon: Users,
      color: 'from-indigo-500/20 to-purple-500/5',
      borderColor: 'border-indigo-500/30',
      iconColor: 'text-indigo-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <div
            key={i}
            className={`p-5 rounded-2xl bg-[#131927] border ${c.borderColor} relative overflow-hidden transition-all duration-200 hover:border-slate-600`}
          >
            <div className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-gradient-to-br ${c.color} blur-xl pointer-events-none`} />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{c.title}</span>
              <Icon className={`w-5 h-5 ${c.iconColor}`} />
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight text-white">
              {isLoading ? (
                <div className="h-8 w-16 bg-slate-800 animate-pulse rounded" />
              ) : (
                c.value.toLocaleString()
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
