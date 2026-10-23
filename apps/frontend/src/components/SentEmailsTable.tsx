import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { EmailDto } from '@inboxpilot/shared';
import { CheckCircle2, AlertTriangle, Search, ExternalLink, RefreshCw, ChevronLeft, ChevronRight, Eye, X } from 'lucide-react';

export const SentEmailsTable: React.FC = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<EmailDto | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['sent-emails', page, search],
    queryFn: () => api.emails.getSent(page, 10, search || undefined),
    refetchInterval: 7000,
  });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  return (
    <div className="bg-[#131927] border border-[#222E46] rounded-2xl overflow-hidden shadow-xl">
      {/* Header toolbar */}
      <div className="p-5 border-b border-[#222E46] flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            Sent & Delivery History
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-normal">
              Ethereal SMTP Audited
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time delivery receipts, SMTP message IDs, and Ethereal preview links
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search recipient or subject..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#0B0F19] border border-[#222E46] rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </form>

          <button
            onClick={() => refetch()}
            title="Refresh list"
            className="p-2 text-slate-400 hover:text-white bg-[#0B0F19] border border-[#222E46] rounded-xl transition"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-emerald-400' : ''}`} />
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
              <th className="px-6 py-3.5 font-medium">Sent Time</th>
              <th className="px-6 py-3.5 font-medium">Status</th>
              <th className="px-6 py-3.5 font-medium text-right">Ethereal Preview / Details</th>
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
                  <td className="px-6 py-4 text-right"><div className="h-7 bg-slate-800 rounded w-24 ml-auto" /></td>
                </tr>
              ))
            ) : isError ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-rose-400">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
                  Failed to load sent emails: {(error as any)?.message}
                </td>
              </tr>
            ) : data?.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-16 text-center text-slate-400">
                  <CheckCircle2 className="w-10 h-10 mx-auto text-slate-600 mb-3" />
                  <div className="font-medium text-base text-white">No Delivered Emails Yet</div>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Once scheduled jobs reach their delivery time, successful and failed dispatches will appear here.
                  </p>
                </td>
              </tr>
            ) : (
              data?.items.map((email) => {
                const dateToDisplay = email.sentAt ? new Date(email.sentAt) : new Date(email.updatedAt);
                const isSuccess = email.status === 'sent';

                return (
                  <tr key={email.id} className="hover:bg-[#182133]/50 transition">
                    <td className="px-6 py-4 font-medium text-white">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isSuccess ? 'bg-emerald-400' : 'bg-rose-500'}`} />
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
                        {dateToDisplay.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {dateToDisplay.toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {isSuccess ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-300 border border-rose-500/20">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {email.etherealPreviewUrl && (
                          <a
                            href={email.etherealPreviewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition"
                          >
                            <span>Preview</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => setSelectedEmail(email)}
                          className="p-1.5 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-lg transition"
                          title="View Delivery Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
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

      {/* Email Details Modal */}
      {selectedEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#131927] border border-[#222E46] rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setSelectedEmail(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Delivery Details
              {selectedEmail.status === 'sent' ? (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Delivered
                </span>
              ) : (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  Failed
                </span>
              )}
            </h3>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <span className="text-slate-400 font-medium">Recipient: </span>
                <span className="text-white font-mono">{selectedEmail.recipientEmail}</span>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Subject: </span>
                <span className="text-white">{selectedEmail.subject}</span>
              </div>
              <div>
                <span className="text-slate-400 font-medium">BullMQ Job ID: </span>
                <span className="text-slate-300 font-mono">{selectedEmail.bullmqJobId || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Idempotency Key: </span>
                <span className="text-slate-300 font-mono text-[11px]">{selectedEmail.idempotencyKey}</span>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Attempts Taken: </span>
                <span className="text-white font-semibold">{selectedEmail.attempts}</span>
              </div>

              {selectedEmail.lastError && (
                <div className="p-3 bg-rose-950/30 border border-rose-800/40 rounded-xl text-rose-200">
                  <div className="font-semibold mb-1">Last Error:</div>
                  <div className="font-mono text-[11px] break-words">{selectedEmail.lastError}</div>
                </div>
              )}

              {selectedEmail.deliveryAttempts && selectedEmail.deliveryAttempts.length > 0 && (
                <div>
                  <div className="text-slate-400 font-medium mb-1.5">Delivery Attempt Log:</div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {selectedEmail.deliveryAttempts.map((attempt) => (
                      <div
                        key={attempt.id}
                        className="p-2 rounded-lg bg-[#0B0F19] border border-[#222E46] text-[11px] flex items-center justify-between"
                      >
                        <div>
                          <span className="font-semibold text-slate-300">Attempt #{attempt.attemptNumber}</span>
                          <span className="text-slate-500 ml-2">
                            {new Date(attempt.startedAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <span
                          className={`font-medium ${
                            attempt.status === 'success' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {attempt.status.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedEmail.etherealPreviewUrl && (
                <div className="pt-2">
                  <a
                    href={selectedEmail.etherealPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
                  >
                    <span>View Email in Ethereal Web Inbox</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
