import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.js';
import { useToast } from '../context/ToastContext.js';
import { parseLeadEmails, calculateScheduledAt } from '@inboxpilot/shared';
import {
  X,
  Upload,
  Send,
  Calendar,
  Clock,
  Gauge,
  CheckCircle2,
  AlertCircle,
  Copy,
  Users,
  FileText,
} from 'lucide-react';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [campaignName, setCampaignName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState(
    'Hi there,\n\nWe are excited to share an update from InboxPilot! Our persistent scheduler ensures zero dropped jobs.\n\nBest regards,\nInboxPilot Team'
  );
  const [senderId, setSenderId] = useState<string>('');

  // Lead input state
  const [leadInputMode, setLeadInputMode] = useState<'upload' | 'manual'>('upload');
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);

  // Parsing result
  const [totalRows, setTotalRows] = useState(0);
  const [validEmails, setValidEmails] = useState<string[]>([]);
  const [invalidEmails, setInvalidEmails] = useState<string[]>([]);
  const [duplicateEmails, setDuplicateEmails] = useState<string[]>([]);

  // Scheduling options
  // Default start time: 2 minutes in the future
  const getInitialStartTime = () => {
    const d = new Date(Date.now() + 2 * 60 * 1000);
    d.setSeconds(0, 0);
    // Format to YYYY-MM-DDTHH:mm for datetime-local
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 16);
  };

  const [startAt, setStartAt] = useState<string>(getInitialStartTime());
  const [delayBetweenEmailsSeconds, setDelayBetweenEmailsSeconds] = useState<number>(2);
  const [hourlyLimit, setHourlyLimit] = useState<number>(200);

  // Load senders
  const { data: senders } = useQuery({
    queryKey: ['senders'],
    queryFn: () => api.senders.list(),
  });

  useEffect(() => {
    if (senders && senders.length > 0 && !senderId) {
      const defaultSender = senders.find((s) => s.isDefault) || senders[0];
      setSenderId(defaultSender.id);
    }
  }, [senders, senderId]);

  // Handle lead parsing
  const handleParseContent = (content: string) => {
    const parsed = parseLeadEmails(content);
    setTotalRows(parsed.totalRows);
    setValidEmails(parsed.validUnique);
    setInvalidEmails(parsed.invalid);
    setDuplicateEmails(parsed.duplicates);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setRawText(content);
      handleParseContent(content);
    };
    reader.readAsText(file);
  };

  const handleManualTextChange = (text: string) => {
    setRawText(text);
    handleParseContent(text);
  };

  const removeEmail = (emailToRemove: string) => {
    setValidEmails((prev) => prev.filter((e) => e !== emailToRemove));
  };

  // Schedule mutation
  const scheduleMutation = useMutation({
    mutationFn: api.emails.schedule,
    onSuccess: (res) => {
      showToast(
        `Successfully scheduled ${res.totalAccepted} emails via BullMQ delayed jobs!`,
        'success',
        'Campaign Scheduled'
      );
      queryClient.invalidateQueries({ queryKey: ['scheduled-emails'] });
      queryClient.invalidateQueries({ queryKey: ['sent-emails'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      onClose();
    },
    onError: (err: any) => {
      showToast(err.message || 'Failed to schedule campaign', 'error');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!subject.trim()) {
      showToast('Please enter an email subject', 'error');
      return;
    }
    if (!body.trim()) {
      showToast('Please enter the email body', 'error');
      return;
    }
    if (validEmails.length === 0) {
      showToast('Please upload or provide at least one valid recipient email', 'error');
      return;
    }

    const startDate = new Date(startAt);
    if (isNaN(startDate.getTime())) {
      showToast('Please select a valid start date and time', 'error');
      return;
    }

    scheduleMutation.mutate({
      name: campaignName.trim() || undefined,
      subject: subject.trim(),
      body: body.trim(),
      senderId: senderId || undefined,
      recipients: validEmails,
      startAt: startDate.toISOString(),
      delayBetweenEmailsMs: delayBetweenEmailsSeconds * 1000,
      hourlyLimit,
    });
  };

  if (!isOpen) return null;

  // Calculate preflight end time
  let calculatedEndTime: string | null = null;
  if (validEmails.length > 0) {
    try {
      const start = new Date(startAt);
      const end = calculateScheduledAt(start, validEmails.length - 1, delayBetweenEmailsSeconds * 1000);
      calculatedEndTime = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-[#131927] border border-[#222E46] rounded-2xl max-w-3xl w-full p-6 shadow-2xl relative my-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Compose & Schedule Campaign</h2>
            <p className="text-xs text-slate-400">
              Configure batch parameters, upload leads, and dispatch through BullMQ delayed workers
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 text-xs">
          {/* Row 1: Campaign Name & Sender */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Campaign Name (Optional)</label>
              <input
                type="text"
                placeholder="e.g. October Product Outreach"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#0B0F19] border border-[#222E46] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Sender Identity</label>
              <select
                value={senderId}
                onChange={(e) => setSenderId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#0B0F19] border border-[#222E46] rounded-xl text-white focus:outline-none focus:border-indigo-500 transition"
              >
                {senders?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} &lt;{s.email}&gt; {s.isDefault ? '(Default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Subject */}
          <div>
            <label className="block text-slate-300 font-medium mb-1.5">
              Email Subject <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Accelerate your outreach with InboxPilot"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 bg-[#0B0F19] border border-[#222E46] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          {/* Row 3: Body */}
          <div>
            <label className="block text-slate-300 font-medium mb-1.5">
              Email Body (Plain Text or HTML) <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={4}
              placeholder="Write your email content here..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 bg-[#0B0F19] border border-[#222E46] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition resize-y font-sans"
            />
          </div>

          {/* Lead Recipients Section */}
          <div className="p-4 bg-[#0B0F19] border border-[#222E46] rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" />
                Recipients & Leads
              </span>
              <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-[#222E46]">
                <button
                  type="button"
                  onClick={() => setLeadInputMode('upload')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                    leadInputMode === 'upload' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Upload CSV / TXT
                </button>
                <button
                  type="button"
                  onClick={() => setLeadInputMode('manual')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                    leadInputMode === 'manual' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Paste List
                </button>
              </div>
            </div>

            {leadInputMode === 'upload' ? (
              <label className="border-2 border-dashed border-[#222E46] hover:border-indigo-500/50 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition bg-[#131927]/40">
                <Upload className="w-6 h-6 text-indigo-400 mb-2" />
                <span className="text-slate-300 font-medium">
                  {fileName ? fileName : 'Click to upload or drag & drop CSV or TXT lead file'}
                </span>
                <span className="text-slate-500 text-[11px] mt-1">
                  Supports headers (Email, recipient) or arbitrary columns with RFC 5322 parsing
                </span>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            ) : (
              <textarea
                rows={3}
                placeholder="Paste email addresses separated by commas, tabs, or newlines (e.g. user1@example.com, user2@example.com)..."
                value={rawText}
                onChange={(e) => handleManualTextChange(e.target.value)}
                className="w-full px-3 py-2 bg-[#131927] border border-[#222E46] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition resize-y font-mono"
              />
            )}

            {/* Parsing Stats Badges */}
            {totalRows > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                  Total Rows: <strong>{totalRows}</strong>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Valid Unique: <strong>{validEmails.length}</strong>
                </span>
                {duplicateEmails.length > 0 && (
                  <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                    <Copy className="w-3.5 h-3.5" />
                    Duplicates: <strong>{duplicateEmails.length}</strong>
                  </span>
                )}
                {invalidEmails.length > 0 && (
                  <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/30 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Invalid: <strong>{invalidEmails.length}</strong>
                  </span>
                )}
              </div>
            )}

            {/* Email chips preview */}
            {validEmails.length > 0 && (
              <div className="max-h-24 overflow-y-auto pr-1 flex flex-wrap gap-1.5 pt-2">
                {validEmails.slice(0, 50).map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#182133] border border-[#222E46] text-slate-300 text-[11px]"
                  >
                    <span>{email}</span>
                    <button
                      type="button"
                      onClick={() => removeEmail(email)}
                      className="text-slate-500 hover:text-rose-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {validEmails.length > 50 && (
                  <span className="text-slate-500 self-center text-[11px]">
                    +{validEmails.length - 50} more recipients
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Scheduling Controls: Start Time, Delay, Rate Limit */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                Start Time
              </label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                required
                className="w-full px-3 py-2 bg-[#0B0F19] border border-[#222E46] rounded-xl text-white focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                Delay Between Emails
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="3600"
                  value={delayBetweenEmailsSeconds}
                  onChange={(e) => setDelayBetweenEmailsSeconds(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-2 bg-[#0B0F19] border border-[#222E46] rounded-xl text-white focus:outline-none focus:border-indigo-500 transition"
                />
                <span className="text-slate-400">sec</span>
              </div>
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1.5 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-indigo-400" />
                Hourly Rate Limit
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={hourlyLimit}
                  onChange={(e) => setHourlyLimit(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 bg-[#0B0F19] border border-[#222E46] rounded-xl text-white focus:outline-none focus:border-indigo-500 transition"
                />
                <span className="text-slate-400">/hr</span>
              </div>
            </div>
          </div>

          {/* Pre-flight Scheduling Confirmation Banner */}
          {validEmails.length > 0 && (
            <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-500/30 flex items-start gap-3">
              <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <div className="text-slate-300 leading-relaxed text-[11px]">
                <strong className="text-white">Batch Preflight Summary:</strong>{' '}
                {validEmails.length} email{validEmails.length > 1 ? 's' : ''} scheduled to begin sending at{' '}
                <span className="text-indigo-300 font-semibold">{new Date(startAt).toLocaleTimeString()}</span>{' '}
                with a <span className="text-indigo-300 font-semibold">{delayBetweenEmailsSeconds}s</span> send interval{' '}
                (finishing ~{calculatedEndTime}). Distributed hourly cap is set to{' '}
                <span className="text-indigo-300 font-semibold">{hourlyLimit}/hr</span>.
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#222E46]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-slate-300 hover:text-white font-medium bg-slate-800/80 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={scheduleMutation.isPending || validEmails.length === 0}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl transition shadow-lg shadow-indigo-600/30 flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              {scheduleMutation.isPending ? 'Scheduling Jobs...' : `Schedule ${validEmails.length} Emails`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
