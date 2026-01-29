"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export function TickerSearch() {
  const [ticker, setTicker] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (ticker.trim().length >= 6) {
      router.push(`/financials/${ticker}`);
    } else {
      alert("Please enter a valid 6-digit ticker code.");
    }
  };

  return (
    <form onSubmit={handleSearch} className="relative w-full max-w-lg">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Enter Ticker (e.g., 005930)..."
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          className="h-12 w-full rounded-full border border-input bg-background pl-10 pr-4 text-lg ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shadow-sm transition-shadow hover:shadow-md"
        />
        <button
          type="submit"
          disabled={ticker.length < 6}
          className="absolute right-1.5 top-1.5 h-9 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          Analyze
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground text-center">
        Try: 005930 (Samsung Elec), 000660 (SK Hynix), 035420 (Naver)
      </p>
    </form>
  );
}