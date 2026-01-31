import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: "Missing raw_archive_id" }, { status: 400 });
  }

  try {
    const archive = await prisma.sourceRawArchive.findUnique({
      where: { id },
      include: {
        integrityLog: true,
        fetchJob: true,
      },
    });

    if (!archive) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: archive.id,
      provider: archive.provider,
      received_at: archive.receivedAt,
      etag: archive.etag || null,
      raw_payload: archive.rawPayload,
      raw_html: archive.rawHtml,
      raw_binary_base64: archive.rawBinary
        ? Buffer.from(archive.rawBinary).toString("base64")
        : null,
      integrity: archive.integrityLog
        ? {
            sha256: archive.integrityLog.sha256,
            hash_algo: archive.integrityLog.hashAlgo,
            computed_at: archive.integrityLog.computedAt,
            verifier_version: archive.integrityLog.verifierVersion,
          }
        : null,
      fetch_job: archive.fetchJob
        ? {
            task_id: archive.fetchJob.taskId,
            provider: archive.fetchJob.provider,
            endpoint: archive.fetchJob.endpoint,
            params: archive.fetchJob.params,
            status: archive.fetchJob.status,
            created_at: archive.fetchJob.createdAt,
            started_at: archive.fetchJob.startedAt,
            finished_at: archive.fetchJob.finishedAt,
          }
        : null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
