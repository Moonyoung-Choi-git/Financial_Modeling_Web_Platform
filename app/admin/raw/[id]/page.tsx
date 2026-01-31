import prisma from "@/lib/db";
import { notFound } from "next/navigation";
import { computeHash } from "@/lib/crypto";
import { CheckCircle2, XCircle, ArrowLeft, FileJson, Shield } from "lucide-react";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

function parseParamsCanonical(paramsCanonical: string) {
  const params = new URLSearchParams(paramsCanonical);
  const parsed: Record<string, string> = {};
  params.forEach((value, key) => {
    parsed[key] = value;
  });
  return parsed;
}

export default async function RawAuditPage({ params }: PageProps) {
  const { id } = await params;

  // 1. Fetch Raw Archive with Integrity Log
  const apiCall = await prisma.rawDartApiCall.findUnique({
    where: { id },
    include: {
      payloadJson: true,
      payloadBinary: true,
    },
  });

  if (!apiCall) {
    notFound();
  }

  // 2. Verify Integrity (Re-compute Hash)
  const payloadJson = apiCall.payloadJson?.bodyJson || null;
  const storedHash = apiCall.payloadHash || apiCall.payloadBinary?.sha256 || null;
  const computedHash = payloadJson ? computeHash(payloadJson) : null;
  const integrityStatus =
    storedHash && computedHash
      ? computedHash === storedHash
        ? "valid"
        : "invalid"
      : "unknown";

  const receivedAt = apiCall.completedAt || apiCall.requestedAt;
  const paramsCanonical = apiCall.paramsCanonical || "";
  const parsedParams = paramsCanonical ? parseParamsCanonical(paramsCanonical) : null;

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
        <div
          className={`rounded-lg border p-6 ${
            integrityStatus === "valid"
              ? "bg-green-500/5 border-green-500/20"
              : integrityStatus === "invalid"
                ? "bg-red-500/5 border-red-500/20"
                : "bg-muted/40 border-border"
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3
                className={`text-lg font-semibold flex items-center gap-2 ${
                  integrityStatus === "valid"
                    ? "text-green-600"
                    : integrityStatus === "invalid"
                      ? "text-red-600"
                      : "text-muted-foreground"
                }`}
              >
                {integrityStatus === "valid" ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : integrityStatus === "invalid" ? (
                  <XCircle className="w-5 h-5" />
                ) : (
                  <Shield className="w-5 h-5" />
                )}
                {integrityStatus === "valid"
                  ? "Integrity Verified"
                  : integrityStatus === "invalid"
                    ? "Integrity Compromised"
                    : "Integrity Unknown"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {storedHash && computedHash
                  ? "The SHA-256 hash of the stored payload matches the ledger."
                  : "No stored hash is available for comparison."}
              </p>
            </div>
            <div className="text-right text-xs font-mono text-muted-foreground space-y-1">
              <div>
                Stored: {storedHash ? `${storedHash.substring(0, 16)}...` : "—"}
              </div>
              <div>
                Actual: {computedHash ? `${computedHash.substring(0, 16)}...` : "—"}
              </div>
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
                <dd className="font-medium">OPENDART</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Received At</dt>
                <dd className="font-medium">{receivedAt.toLocaleString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Task ID</dt>
                <dd className="font-mono text-xs">{apiCall.jobId || apiCall.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Endpoint</dt>
                <dd className="font-mono text-xs">{apiCall.endpoint}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h3 className="font-semibold mb-4">Request Parameters</h3>
            <pre className="text-xs bg-muted p-4 rounded-md overflow-auto max-h-[140px]">
              {parsedParams
                ? JSON.stringify(parsedParams, null, 2)
                : paramsCanonical || "—"}
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
              {payloadJson
                ? JSON.stringify(payloadJson, null, 2)
                : apiCall.payloadBinary?.blobPath
                  ? `Binary payload stored at: ${apiCall.payloadBinary.blobPath}`
                  : "No JSON payload recorded."}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
