import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { useToast } from '../context/ToastContext.js';
import { Clock, Search, XCircle, AlertCircle, ChevronLeft, ChevronRight, RefreshCw, Send } from 'lucide-react';

interface ScheduledEmailsTableProps {
  onOpenCompose: () => void;
}

export const ScheduledEmailsTable: React.FC<ScheduledEmailsTableProps> = ({ onOpenCompose }) => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [emailToCancel, setEmailToCancel] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['scheduled-emails', page, search],
    queryFn: () => api.emails.getScheduled(page, 10, search || undefined),
    refetchInterval: 5000, // auto-refresh to reflect sending progress
  });

  const cancelMutation = useMutation({
    mutationFn: (emailId: string) => api.emails.cancel(emailId),
    onSuccess: () => {
      showToast('Scheduled email was safely cancelled.', 'success');
      setEmailToCancel(null);
      queryClient.invalidateQueries({ queryKey: ['scheduled-emails'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (err: any) => {
      showToast(err.message || 'Failed to cancel email', 'error');
    },
  });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  return (
    <div className="bg-[#131927] border border-[#222E46] rounded-2xl overflow-hidden shadow-xl">
      {/* Table Header / Filter toolbar */}
      <div className="p-5 border-b border-[#222E46] flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            Scheduled Queue
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-normal">
              BullMQ Delayed
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Emails queued for future delivery backed by persistent Redis storage
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by recipient or subject..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#0B0F19] border border-[#222E46] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </form>

          <button
            onClick={() => refetch()}
            title="Refresh queue"
            className="p-2 text-slate-400 hover:text-white bg-[#0B0F19] border border-[#222E46] rounded-xl transition"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-[#0B0F19]/60 text-xs text-slate-400 uppercase tracking-wider border-b border-[#222E46]">
            <tr>
              <th className="px-6 py-3.5 font-medium">Recipient</th>
              <th className="px-6 py-3.5 font-medium">Subject</th>
              <th className="px-6 py-3.5 font-medium">Scheduled Time</th>
              <th className="px-6 py-3.5 font-medium">Status</th>
              <th className="px-6 py-3.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#222E46]/60">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-36" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-48" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-32" /></td>
                  <td className="px-6 py-4"><div className="h-5 bg-slate-800 rounded-full w-20" /></td>
                  <td className="px-6 py-4 text-right"><div className="h-7 bg-slate-800 rounded w-16 ml-auto" /></td>
                </tr>
              ))
            ) : isError ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-rose-400">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                  Failed to load scheduled emails: {(error as any)?.message}
                </td>
              </tr>
            ) : data?.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-16 text-center text-slate-400">
                  <Clock className="w-10 h-10 mx-auto text-slate-600 mb-3" />
                  <div className="font-medium text-base text-white">No Scheduled Emails in Queue</div>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    All jobs have been processed or you haven't scheduled any campaigns yet.
                  </p>
                  <button
                    onClick={onOpenCompose}
                    className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Schedule a New Campaign
                  </button>
                </td>
              </tr>
            ) : (
              data?.items.map((email) => {
                const scheduledDate = new Date(email.scheduledAt);
                const isProcessing = email.status === 'processing';

                return (
                  <tr key={email.id} className="hover:bg-[#182133]/50 transition">
                    <td className="px-6 py-4 font-medium text-white">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        <span>{email.recipientEmail}</span>
                      </div>
                      {email.sender && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          From: {email.sender.name} ({email.sender.email})
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      <div className="max-w-xs truncate font-medium">{email.subject}</div>
                      <div className="text-xs text-slate-500 truncate max-w-xs">{email.body}</div>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-300">
                      <div className="font-semibold text-slate-200">
                        {scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {scheduledDate.toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {isProcessing ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                          Processing
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          Scheduled
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setEmailToCancel(email.id)}
                        disabled={isProcessing}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition disabled:opacity-50 disabled:pointer-events-none"
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {data && data.totalPages > 1 && (
        <div className="p-4 border-t border-[#222E46] flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing <span className="font-semibold text-white">{(page - 1) * 10 + 1}</span> to{' '}
            <span className="font-semibold text-white">{Math.min(page * 10, data.total)}</span> of{' '}
            <span className="font-semibold text-white">{data.total}</span> entries
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg bg-[#0B0F19] border border-[#222E46] hover:text-white disabled:opacity-40 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>Page {page} of {data.totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              className="p-1.5 rounded-lg bg-[#0B0F19] border border-[#222E46] hover:text-white disabled:opacity-40 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Cancellation confirmation modal */}
      {emailToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#131927] border border-[#222E46] rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
              <XCircle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Cancel Scheduled Email?</h3>
            <p className="text-sm text-slate-400 mt-2">
              This email will be removed from BullMQ queue and will not be dispatched. This action is permanent.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setEmailToCancel(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/80 rounded-xl transition"
              >
                Keep Scheduled
              </button>
              <button
                onClick={() => cancelMutation.mutate(emailToCancel)}
                disabled={cancelMutation.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition flex items-center gap-2"
              >
                {cancelMutation.isPending ? 'Cancelling...' : 'Yes, Cancel Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
