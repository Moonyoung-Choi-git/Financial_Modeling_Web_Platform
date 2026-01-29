"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCcw } from "lucide-react";

type SummaryResponse = {
  range: { from: string; to: string };
  totals: {
    jobs: number;
    dlq: number;
    raw_archives: number;
    integrity_logs: number;
    success_rate: number | null;
    integrity_coverage: number | null;
  };
  status_counts: Record<string, number>;
  provider_breakdown: {
    provider: string;
    total: number;
    status: Record<string, number>;
  }[];
};

type DlqItem = {
  id: string;
  task_id: string;
  raw_archive_id: string | null;
  provider: string | null;
  error_type: string;
  error_message: string;
  retry_count: number;
  next_retry_at: string | null;
  created_at: string;
  status: string;
};

const formatDateInput = (date: Date) => date.toISOString().slice(0, 10);
const formatPercent = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toFixed(2)}%`;
const formatNumber = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat("en-US").format(value);
const formatDateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString() : "—";

export default function AdminDashboardPage() {
  const today = useMemo(() => new Date(), []);
  const fromDefault = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date;
  }, []);

  const [from, setFrom] = useState(formatDateInput(fromDefault));
  const [to, setTo] = useState(formatDateInput(today));
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [dlq, setDlq] = useState<DlqItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [summaryRes, dlqRes] = await Promise.all([
          fetch(`/api/admin/integrity/summary?from=${from}&to=${to}`, {
            signal: controller.signal,
          }),
          fetch(`/api/admin/dlq?from=${from}&to=${to}&limit=50`, {
            signal: controller.signal,
          }),
        ]);

        if (!summaryRes.ok) {
          throw new Error("Failed to load integrity summary");
        }
        if (!dlqRes.ok) {
          throw new Error("Failed to load DLQ records");
        }

        const summaryJson = (await summaryRes.json()) as SummaryResponse;
        const dlqJson = await dlqRes.json();

        if (!isMounted) return;
        setSummary(summaryJson);
        setDlq(dlqJson.items || []);
      } catch (err: any) {
        if (!isMounted) return;
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load dashboard data");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchData();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [from, to, refreshKey]);

  const statusRows = summary
    ? Object.entries(summary.status_counts).sort((a, b) =>
        a[0].localeCompare(b[0])
      )
    : [];

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-full border p-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Integrity Dashboard
              </h1>
              <p className="text-sm text-muted-foreground">
                Ingestion quality and DLQ overview
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
              <span className="text-muted-foreground">From</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="bg-transparent text-sm outline-none"
              />
              <span className="text-muted-foreground">To</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="bg-transparent text-sm outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setRefreshKey((prev) => prev + 1)}
              className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm hover:bg-muted"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </header>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total Jobs</p>
            <p className="mt-2 text-2xl font-semibold">
              {summary ? formatNumber(summary.totals.jobs) : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Range: {from} → {to}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Success Rate</p>
            <p className="mt-2 text-2xl font-semibold">
              {summary ? formatPercent(summary.totals.success_rate) : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Success: {summary ? formatNumber(summary.status_counts.SUCCESS) : "—"}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">DLQ Records</p>
            <p className="mt-2 text-2xl font-semibold">
              {summary ? formatNumber(summary.totals.dlq) : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Needs review</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Integrity Coverage</p>
            <p className="mt-2 text-2xl font-semibold">
              {summary ? formatPercent(summary.totals.integrity_coverage) : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Logs: {summary ? formatNumber(summary.totals.integrity_logs) : "—"}
            </p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold">Status Breakdown</h2>
            <div className="mt-3 space-y-2 text-sm">
              {statusRows.length === 0 && (
                <p className="text-muted-foreground">No data.</p>
              )}
              {statusRows.map(([status, count]) => (
                <div
                  key={status}
                  className="flex items-center justify-between"
                >
                  <span className="text-muted-foreground">{status}</span>
                  <span className="font-medium">{formatNumber(count)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold">Provider Breakdown</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2">Provider</th>
                    <th className="py-2 text-right">Total</th>
                    <th className="py-2 text-right">Success</th>
                    <th className="py-2 text-right">Failed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(summary?.provider_breakdown || []).map((row) => (
                    <tr key={row.provider} className="text-xs">
                      <td className="py-2 font-medium">{row.provider}</td>
                      <td className="py-2 text-right">
                        {formatNumber(row.total)}
                      </td>
                      <td className="py-2 text-right">
                        {formatNumber(row.status.SUCCESS || 0)}
                      </td>
                      <td className="py-2 text-right">
                        {formatNumber(row.status.FAILED || 0)}
                      </td>
                    </tr>
                  ))}
                  {!summary?.provider_breakdown?.length && (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-3 text-center text-muted-foreground"
                      >
                        No data.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">DLQ Records (latest 50)</h2>
            {loading && (
              <span className="text-xs text-muted-foreground">Loading…</span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="text-left">
                  <th className="px-4 py-2">Provider</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Message</th>
                  <th className="px-4 py-2 text-right">Retries</th>
                  <th className="px-4 py-2">Next Retry</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2">Raw</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dlq.map((item) => (
                  <tr key={item.id} className="text-xs">
                    <td className="px-4 py-2 font-medium">
                      {item.provider || "—"}
                    </td>
                    <td className="px-4 py-2">{item.error_type}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {item.error_message.length > 80
                        ? `${item.error_message.slice(0, 80)}…`
                        : item.error_message}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatNumber(item.retry_count)}
                    </td>
                    <td className="px-4 py-2">
                      {formatDateTime(item.next_retry_at)}
                    </td>
                    <td className="px-4 py-2">
                      {formatDateTime(item.created_at)}
                    </td>
                    <td className="px-4 py-2">
                      {item.raw_archive_id ? (
                        <Link
                          href={`/admin/raw/${item.raw_archive_id}`}
                          className="text-primary hover:underline"
                        >
                          View
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
                {!dlq.length && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-4 text-center text-muted-foreground"
                    >
                      No DLQ records in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
