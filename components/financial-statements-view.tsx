"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Loader2, FileText, TrendingUp, DollarSign, DownloadCloud } from "lucide-react";

interface FinancialAccount {
  id: string;
  standardAccountName: string;
  reportedAccountName: string;
  value: string;
  unit: string;
  statementType: "IS" | "BS" | "CF";
  standardAccountCode: string;
}

interface FinancialData {
  IS: FinancialAccount[];
  BS: FinancialAccount[];
  CF: FinancialAccount[];
}

export default function FinancialStatementsView({ ticker }: { ticker: string }) {
  const [year, setYear] = useState<number>(new Date().getFullYear() - 1);
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"IS" | "BS" | "CF">("IS");
  const [ingesting, setIngesting] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/financials/3st?ticker=${encodeURIComponent(ticker)}&year=${year}`
        );

        // 404는 에러가 아니라 '데이터 없음'으로 처리하여 안내 UI를 표시
        if (res.status === 404) {
          setData(null);
          return;
        }

        if (!res.ok) {
          let message = `${res.status} ${res.statusText}`;
          const contentType = res.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const body = await res.json();
            if (body?.error) message = body.error;
          } else {
            const text = await res.text();
            if (text) message = text;
          }
          throw new Error(message);
        }
        const json: FinancialData = await res.json();
        setData(json);
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : "Unknown error";
        const message = rawMessage
          .replace(/\s+/g, " ")
          .slice(0, 220);
        console.error("Error fetching financial data:", error);
        setError(message);
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [ticker, year]);

  const handleIngest = async () => {
    setIngesting(true);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, year }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Ingestion failed");
      }

      // 수집 성공 후 데이터 재조회 (새로고침 효과)
      // 간단히 year를 다시 설정하여 useEffect 트리거
      const currentYear = year;
      setYear(0); 
      setTimeout(() => setYear(currentYear), 50);
    } catch (err: any) {
      alert(`Failed to ingest data: ${err.message}`);
    } finally {
      setIngesting(false);
    }
  };

  const formatNumber = (val: string) => {
    const num = parseFloat(val);
    return new Intl.NumberFormat("ko-KR").format(num);
  };

  const tabs = [
    { id: "IS", label: "Income Statement", icon: FileText },
    { id: "BS", label: "Balance Sheet", icon: DollarSign },
    { id: "CF", label: "Cash Flow", icon: TrendingUp },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between bg-card p-4 rounded-lg border shadow-sm">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Fiscal Year</h2>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {[2025, 2024, 2023, 2022, 2021, 2020].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        
        <div className="flex bg-muted p-1 rounded-md">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-sm transition-all",
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-lg border bg-card shadow-sm overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p>Loading financial data...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground text-center px-6">
            <p className="font-medium">Failed to load financial data.</p>
            <p className="text-sm mt-1 break-all">{error}</p>
            {error.includes("Database schema not initialized") && (
              <p className="text-xs mt-2 text-muted-foreground">
                Run <span className="font-mono">npm run db:push</span> (or{" "}
                <span className="font-mono">npm run db:migrate</span>) and restart
                the app.
              </p>
            )}
          </div>
        ) : !data || data[activeTab].length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
            <p>No data available for {year}.</p>
            <p className="text-sm mt-1">Try running ingestion for this period.</p>
            <button
              onClick={handleIngest}
              disabled={ingesting}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {ingesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
              {ingesting ? "Ingesting from DART..." : "Ingest Data from DART"}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground font-medium">
                <tr>
                  <th className="px-6 py-3 w-[15%]">Code</th>
                  <th className="px-6 py-3 w-[30%]">Standard Account</th>
                  <th className="px-6 py-3 w-[30%]">Reported Account (Raw)</th>
                  <th className="px-6 py-3 w-[25%] text-right">Value (KRW)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data[activeTab].map((item) => (
                  <tr 
                    key={item.id} 
                    className="hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-6 py-3 font-mono text-xs text-muted-foreground">
                      {item.standardAccountCode}
                    </td>
                    <td className="px-6 py-3 font-medium">
                      {item.standardAccountName}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {item.reportedAccountName}
                    </td>
                    <td className="px-6 py-3 text-right font-mono tabular-nums">
                      {formatNumber(item.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
