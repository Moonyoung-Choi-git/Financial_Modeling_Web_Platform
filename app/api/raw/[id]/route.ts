import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

function parseParamsCanonical(paramsCanonical: string) {
  const params = new URLSearchParams(paramsCanonical);
  const parsed: Record<string, string> = {};
  params.forEach((value, key) => {
    parsed[key] = value;
  });
  return parsed;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: "Missing raw_archive_id" }, { status: 400 });
  }

  try {
    const apiCall = await prisma.rawDartApiCall.findUnique({
      where: { id },
      include: {
        payloadJson: true,
        payloadBinary: true,
      },
    });

    if (!apiCall) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const params = parseParamsCanonical(apiCall.paramsCanonical || "");
    const receivedAt = apiCall.completedAt || apiCall.requestedAt;

    return NextResponse.json({
      id: apiCall.id,
      provider: "OPENDART",
      received_at: receivedAt,
      etag: null,
      raw_payload: apiCall.payloadJson?.bodyJson || null,
      raw_html: null,
      raw_binary_base64: null,
      blob_path: apiCall.payloadBinary?.blobPath || null,
      integrity: apiCall.payloadHash
        ? {
            sha256: apiCall.payloadHash,
            hash_algo: "SHA-256",
            computed_at: apiCall.completedAt,
            verifier_version: "dart-client",
          }
        : null,
      fetch_job: apiCall
        ? {
            task_id: apiCall.jobId || apiCall.id,
            provider: "OPENDART",
            endpoint: apiCall.endpoint,
            params,
            status: apiCall.dartStatus || null,
            created_at: apiCall.requestedAt,
            started_at: apiCall.requestedAt,
            finished_at: apiCall.completedAt,
          }
        : null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
