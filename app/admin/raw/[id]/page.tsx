import prisma from "@/lib/db";
import { notFound } from "next/navigation";
import { computeHash } from "@/lib/crypto";
import { CheckCircle2, XCircle, ArrowLeft, FileJson, Shield } from "lucide-react";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RawAuditPage({ params }: PageProps) {
  const { id } = await params;

  // 1. Fetch Raw Archive with Integrity Log
  const archive = await prisma.sourceRawArchive.findUnique({
    where: { id },
    include: {
      integrityLog: true,
      fetchJob: true,
    },
  });

  if (!archive) {
    notFound();
  }

  // 2. Verify Integrity (Re-compute Hash)
  const computedHash = computeHash(archive.rawPayload);
  const storedHash = archive.integrityLog?.sha256;
  const isIntegrityValid = computedHash === storedHash;

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/admin/dashboard" className="p-2 hover:bg-muted rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Shield className="w-6 h-6" />
              Audit Mode: Raw Archive Viewer
            </h1>
            <p className="text-muted-foreground text-sm font-mono mt-1">{id}</p>
          </div>
        </div>

        {/* Integrity Status Card */}
        <div className={`rounded-lg border p-6 ${isIntegrityValid ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className={`text-lg font-semibold flex items-center gap-2 ${isIntegrityValid ? 'text-green-600' : 'text-red-600'}`}>
                {isIntegrityValid ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                {isIntegrityValid ? 'Integrity Verified' : 'Integrity Compromised'}
              </h3>
              <p className="text-sm text-muted-foreground">
                The SHA-256 hash of the stored payload matches the immutable audit log.
              </p>
            </div>
            <div className="text-right text-xs font-mono text-muted-foreground space-y-1">
              <div>Stored: {storedHash?.substring(0, 16)}...</div>
              <div>Actual: {computedHash.substring(0, 16)}...</div>
            </div>
          </div>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <FileJson className="w-4 h-4" />
              Ingestion Metadata
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Provider</dt>
                <dd className="font-medium">{archive.provider}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Received At</dt>
                <dd className="font-medium">{new Date(archive.receivedAt).toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Task ID</dt>
                <dd className="font-mono text-xs">{archive.taskId}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">ETag</dt>
                <dd className="font-mono text-xs">{archive.etag || 'N/A'}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h3 className="font-semibold mb-4">Request Parameters</h3>
            <pre className="text-xs bg-muted p-4 rounded-md overflow-auto max-h-[140px]">
              {JSON.stringify(archive.fetchJob?.params, null, 2)}
            </pre>
          </div>
        </div>

        {/* Raw Payload Viewer */}
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="p-4 border-b bg-muted/30 flex justify-between items-center">
            <h3 className="font-semibold text-sm">Raw Payload (JSONB)</h3>
            <span className="text-xs text-muted-foreground">Read-Only / Immutable</span>
          </div>
          <div className="p-0">
            <pre className="text-xs p-4 overflow-auto max-h-[600px] font-mono">
              {JSON.stringify(archive.rawPayload, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}