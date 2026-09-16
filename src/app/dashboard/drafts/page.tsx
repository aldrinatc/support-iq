'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Inbox,
  Clock,
  CheckCircle2,
  Send,
  RefreshCw,
  Search,
  ChevronRight,
  Sparkles,
  User,
  AlertCircle,
} from 'lucide-react';
import { getApiBasePath } from '@/lib/api-utils';
import { DraftReviewWidget } from '@/components/widgets/DraftReviewWidget';
import type { DraftReviewData } from '@/types/widget';
import { getConfidenceColor } from '@/types/draft';

type FilterStatus = 'ALL' | 'PENDING_REVIEW' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'SENT';

// API helper to fetch drafts
async function fetchDrafts(status?: string): Promise<DraftReviewData[]> {
  try {
    const params = new URLSearchParams();
    if (status && status !== 'ALL') {
      params.set('status', status);
    }
    params.set('limit', '50');

    const basePath = getApiBasePath();
    const response = await fetch(`${basePath}/api/drafts?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch drafts');

    const data = await response.json();
    if (data.success && data.drafts?.length > 0) {
      // Transform API response to match DraftReviewData
      return data.drafts.map((draft: Record<string, unknown>) => ({
        ...draft,
        generatedAt: draft.generatedAt || draft.createdAt,
        versions: draft.versions || [],
      }));
    }
    return [];
  } catch (error) {
    throw error;
  }
}

// API helper for draft actions
async function performDraftAction(
  draftId: string,
  action: string,
  payload?: Record<string, unknown>
): Promise<boolean> {
  try {
    const endpoint = `${process.env.NEXT_PUBLIC_BASE_PATH || "/dsq"}/api/drafts/${draftId}/${action}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error(`[Drafts] Action ${action} failed:`, error);
    return false;
  }
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<DraftReviewData[]>([]);
  const [selectedDraft, setSelectedDraft] = useState<DraftReviewData | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usingDemoData = false;

  // Fetch drafts from API on mount and when filter changes
  const loadDrafts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try { setDrafts(await fetchDrafts(filterStatus)); }
    catch { setError('Could not load saved drafts. Please refresh to retry.'); }

    setIsLoading(false);
  }, [filterStatus]);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  // Filter and search drafts
  const filteredDrafts = drafts.filter((draft) => {
    const matchesStatus = filterStatus === 'ALL' || draft.status === filterStatus;
    const matchesSearch =
      searchQuery === '' ||
      draft.ticketId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      draft.ticketSubject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (draft.customerName || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Stats
  const stats = {
    pending: drafts.filter((d) => d.status === 'PENDING_REVIEW').length,
    inReview: drafts.filter((d) => d.status === 'IN_REVIEW').length,
    approved: drafts.filter((d) => d.status === 'APPROVED').length,
    sent: drafts.filter((d) => d.status === 'SENT').length,
    avgConfidence:
      drafts.length > 0
        ? drafts.reduce((sum, d) => sum + d.confidenceScore, 0) / drafts.length
        : 0,
  };

  const handleDraftAction = async (
    action: string,
    payload?: Record<string, unknown>
  ) => {
    if (!selectedDraft) return;


    // Call real API
    setIsLoading(true);
    const success = await performDraftAction(selectedDraft.id, action, payload);

    if (success) {
      // Refresh drafts list from API
      await loadDrafts();

      // Clear selection after successful action
      if (['approve', 'reject', 'send'].includes(action)) {
        setSelectedDraft(null);
      }
    } else {
      setError(`Failed to ${action} draft. Please try again.`);
    }

    setIsLoading(false);
  };

  const refreshDrafts = async () => {
    await loadDrafts();
  };

  // Status and priority color mappings for future use
  const _statusColors: Record<string, string> = {
    PENDING_REVIEW: 'bg-chart-4/20 text-chart-4 border-chart-4/30',
    IN_REVIEW: 'bg-primary/20 text-primary border-primary/30',
    APPROVED: 'bg-success/20 text-success border-success/30',
    REJECTED: 'bg-destructive/20 text-destructive border-destructive/30',
    SENT: 'bg-success/20 text-success border-success/30',
  };

  const _priorityColors: Record<string, string> = {
    CRITICAL: 'bg-destructive/20 text-destructive',
    HIGH: 'bg-chart-4/20 text-chart-4',
    MEDIUM: 'bg-chart-3/20 text-chart-3',
    LOW: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Command Center Style */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-card-elevated/95 backdrop-blur-xl">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Draft Review Queue</h1>
              <p className="text-sm text-muted-foreground">
                AI-generated responses • <span className="text-primary font-medium">{drafts.length} total</span> • {stats.pending} pending review
              </p>
            </div>
            {/* Right Header Controls - Matching Tickets/AI Assistant Style */}
            <div className="flex items-center gap-3">
              {/* Confidence Indicator - Solid Background Pill */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-background border border-border rounded-lg">
                <span className={`h-2 w-2 rounded-full ${stats.avgConfidence >= 85 ? 'bg-success' : stats.avgConfidence >= 70 ? 'bg-amber-500' : 'bg-destructive'}`} />
                <span className="text-sm font-medium text-foreground">
                  {stats.avgConfidence.toFixed(1)}% Confidence
                </span>
              </div>
              {/* Refresh Button - Same Style */}
              <button
                onClick={refreshDrafts}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="px-6 py-6">
        {/* Demo Data Banner */}
        {usingDemoData && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-center gap-4 animate-slide-up">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-500">Demo Mode Active</p>
              <p className="text-xs text-amber-500/70">
                Using sample data for demonstration. Connect to Supabase for production data.
              </p>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-destructive/5 border border-destructive/20 flex items-center gap-4 animate-slide-up">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <p className="text-sm text-destructive flex-1 font-medium">{error}</p>
            <button
              onClick={() => setError(null)}
              className="btn-ghost text-destructive hover:bg-destructive/10 text-sm font-medium px-3 py-1.5 rounded-lg"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Stats Bar - Premium Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="metric-card card-command rounded-xl p-5 group">
            <div className="flex items-start justify-between mb-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              {stats.pending > 0 && (
                <span className="badge-pending text-xs px-2 py-0.5 rounded-full font-semibold">
                  Action Required
                </span>
              )}
            </div>
            <div className="text-3xl font-bold text-foreground mb-1">{stats.pending}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Pending Review</div>
          </div>

          <div className="metric-card card-command rounded-xl p-5 group">
            <div className="flex items-start justify-between mb-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <User className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div className="text-3xl font-bold text-foreground mb-1">{stats.inReview}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">In Review</div>
          </div>

          <div className="metric-card card-command rounded-xl p-5 group">
            <div className="flex items-start justify-between mb-3">
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
            </div>
            <div className="text-3xl font-bold text-foreground mb-1">{stats.approved}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Approved Today</div>
          </div>

          <div className="metric-card card-command rounded-xl p-5 group">
            <div className="flex items-start justify-between mb-3">
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Send className="h-5 w-5 text-success" />
              </div>
            </div>
            <div className="text-3xl font-bold text-foreground mb-1">{stats.sent}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Sent Today</div>
          </div>
        </div>

        {/* Main Content - Split View */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Draft List Panel */}
          <div className="lg:col-span-1">
            <div className="card-command rounded-xl overflow-hidden">
              {/* Search and Filter Header */}
              <div className="p-4 border-b border-border/50 bg-card-elevated/50">
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search tickets, customers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background/50 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {(['ALL', 'PENDING_REVIEW', 'IN_REVIEW', 'APPROVED', 'SENT'] as FilterStatus[]).map(
                    (status) => {
                      const isSelected = filterStatus === status;
                      const statusLabel = status === 'ALL' ? 'All' : status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
                      return (
                        <button
                          key={status}
                          onClick={() => setFilterStatus(status)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all duration-200 ${
                            isSelected
                              ? 'btn-primary shadow-sm'
                              : 'bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                          }`}
                        >
                          {statusLabel}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Draft Items List */}
              <div className="max-h-[calc(100vh-420px)] overflow-y-auto scrollbar-thin">
                {filteredDrafts.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="h-16 w-16 mx-auto rounded-xl bg-muted/30 flex items-center justify-center mb-4">
                      <Inbox className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">No drafts found</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Try adjusting your filters</p>
                  </div>
                ) : (
                  filteredDrafts.map((draft, index) => (
                    <button
                      key={draft.id}
                      onClick={() => setSelectedDraft(draft)}
                      className={`w-full text-left p-4 border-b border-border/30 transition-all duration-200 hover:bg-primary/5 ${
                        selectedDraft?.id === draft.id
                          ? 'bg-primary/10 border-l-2 border-l-primary'
                          : 'border-l-2 border-l-transparent'
                      }`}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-xs font-mono text-primary font-bold tracking-wide">
                          {draft.ticketId}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${
                            draft.status === 'PENDING_REVIEW' ? 'badge-pending' :
                            draft.status === 'APPROVED' ? 'badge-approved' :
                            draft.status === 'SENT' ? 'badge-sent' :
                            'badge-in-review'
                          }`}
                        >
                          {draft.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-foreground mb-2 line-clamp-1">
                        {draft.ticketSubject}
                      </h4>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <span className="text-xs text-muted-foreground flex-1 truncate">
                          {draft.customerName}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                            draft.priority === 'CRITICAL' ? 'bg-destructive/20 text-destructive' :
                            draft.priority === 'HIGH' ? 'bg-amber-500/20 text-amber-500' :
                            draft.priority === 'MEDIUM' ? 'bg-primary/20 text-primary' :
                            'bg-muted text-muted-foreground'
                          }`}
                        >
                          {draft.priority}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-border/20">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          <span
                            className={`text-xs font-bold ${getConfidenceColor(draft.confidenceScore)}`}
                          >
                            {draft.confidenceScore.toFixed(0)}%
                          </span>
                          <span className="text-[10px] text-muted-foreground">confidence</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(draft.generatedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <ChevronRight className={`h-4 w-4 transition-transform ${selectedDraft?.id === draft.id ? 'text-primary translate-x-0.5' : 'text-muted-foreground'}`} />
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Draft Review Panel - Split View */}
          <div className="lg:col-span-2">
            {selectedDraft ? (
              <DraftReviewWidget data={selectedDraft} onAction={handleDraftAction} />
            ) : (
              <div className="card-command rounded-xl p-16 text-center min-h-[500px] flex flex-col items-center justify-center">
                <div className="relative mb-6">
                  <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <Inbox className="h-10 w-10 text-primary/50" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Select a Draft to Review
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                  Choose a draft from the queue to review the AI-generated response, make edits, and approve or reject it before sending to the customer.
                </p>
                <div className="mt-8 flex items-center gap-6 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-amber-500" />
                    <span>Pending</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <span>In Review</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-success" />
                    <span>Approved</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
