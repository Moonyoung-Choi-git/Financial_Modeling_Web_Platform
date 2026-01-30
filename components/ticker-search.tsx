"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export function TickerSearch() {
  const [ticker, setTicker] = useState("");
  const [market, setMarket] = useState("KOSPI");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const input = ticker.trim();
    const isStockCode = /^\d{6}$/.test(input);
    const isCorpCode = /^\d{8}$/.test(input);

    if (isStockCode || isCorpCode || input.length >= 2) {
      router.push(`/financials/${encodeURIComponent(input)}?market=${market}`);
      return;
    }

    alert("Please enter a 6-digit stock code, 8-digit corp code, or company name.");
  };

  return (
    <form onSubmit={handleSearch} className="relative w-full max-w-2xl">
      <div className="flex items-stretch gap-2">
        <label className="relative flex items-center">
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            className="h-12 rounded-full border border-input bg-background px-4 text-sm font-medium text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="KOSPI">KOSPI</option>
            <option value="KOSDAQ">KOSDAQ</option>
            <option value="KONEX">KONEX</option>
            <option value="OTHER">기타법인</option>
          </select>
        </label>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="종목코드/기업명 입력 (예: 005930, 삼성전자, 00126380)"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="h-12 w-full rounded-full border border-input bg-background pl-10 pr-24 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shadow-sm transition-shadow hover:shadow-md"
          />
          <button
            type="submit"
            disabled={ticker.trim().length < 2}
            className="absolute right-1.5 top-1.5 h-9 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            Analyze
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground text-center">
        Try: 005930 (Samsung Elec), 000660 (SK Hynix), 삼성전자, 00126380 (corp code)
      </p>
    </form>
  );
}
