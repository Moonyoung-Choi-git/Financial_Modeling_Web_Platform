import Link from "next/link";
import { notFound } from "next/navigation";
import FinancialStatementsView from "@/components/financial-statements-view";
import { ArrowLeft, Building2 } from "lucide-react";

interface PageProps {
  params: Promise<{ ticker: string }>;
}

export default async function FinancialsPage({ params }: PageProps) {
  const { ticker } = await params;
  const normalized = (ticker || "").trim();

  if (!normalized) {
    notFound();
  }

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
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                {normalized} Financials
              </h1>
              <p className="text-sm text-muted-foreground">
                Refined 3-statement view (IS/BS/CF)
              </p>
            </div>
          </div>
        </header>

        <FinancialStatementsView ticker={normalized} />
      </div>
    </div>
  );
}
