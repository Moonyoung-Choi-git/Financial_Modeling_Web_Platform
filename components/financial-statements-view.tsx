"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Loader2, FileText, TrendingUp, DollarSign } from "lucide-react";

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
  const [activeTab, setActiveTab] = useState<"IS" | "BS" | "CF">("IS");

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/financials/3st?ticker=${ticker}&year=${year}`);
        if (!res.ok) throw new Error("Failed to fetch data");
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Error fetching financial data:", error);
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [ticker, year]);

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
        ) : !data || data[activeTab].length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
            <p>No data available for {year}.</p>
            <p className="text-sm mt-1">Try running ingestion for this period.</p>
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