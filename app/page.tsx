import Link from "next/link";
import { TickerSearch } from "@/components/ticker-search";
import { ShieldCheck, Activity, Database } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-8 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col items-center gap-8 max-w-2xl w-full text-center">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Financial Modeling <br />
            <span className="text-primary">Web Platform</span>
          </h1>
          <p className="text-lg text-muted-foreground">
            Auditable, Reproducible, and Immutable.
            <br />
          </p>
        </div>

        <div className="w-full flex justify-center py-4">
          <TickerSearch />
        </div>

        <div className="flex gap-4 items-center flex-col sm:flex-row">
          <Link
            href="/admin/dashboard"
            className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5"
          >
            <Activity className="w-4 h-4" />
            Integrity Dashboard
          </Link>
          <a
            href="https://opendart.fss.or.kr/"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-center hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 sm:min-w-44"
          >
            OpenDART Reference
          </a>
        </div>
      </main>
      <footer className="mt-16 text-sm text-muted-foreground flex gap-6 flex-wrap justify-center">
        <div className="flex items-center gap-2"><Database className="w-4 h-4" /> Immutable Lake</div>
        <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Provable Integrity</div>
      </footer>
    </div>
  );
}