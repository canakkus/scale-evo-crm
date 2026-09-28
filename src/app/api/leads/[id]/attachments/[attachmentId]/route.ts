import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findAccessibleLead } from "@/lib/workspace";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { id, attachmentId } = await params;
    const lead = await findAccessibleLead(user, id);
    if (!lead) {
      return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });
    }

    const attachment = await prisma.leadAttachment.findFirst({
      where: { id: attachmentId, leadId: id },
    });

    if (!attachment) {
      return NextResponse.json({ error: "Anhang nicht gefunden." }, { status: 404 });
    }

    // Try deleting from Supabase storage if URL matches bucket
    try {
      const bucketName = "lead-attachments";
      const bucketMarker = `/${bucketName}/`;
      if (attachment.url.includes(bucketMarker)) {
        const path = attachment.url.split(bucketMarker)[1];
        if (path) {
          const supabase = createSupabaseAdminClient();
          await supabase.storage.from(bucketName).remove([decodeURIComponent(path)]);
        }
      }
    } catch (storageErr) {
      console.warn("[Delete Attachment Storage Warning]:", storageErr);
    }

    await prisma.leadAttachment.delete({
      where: { id: attachmentId },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[DELETE /api/leads/[id]/attachments/[attachmentId]] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Fehler beim Löschen des Anhangs." },
      { status: 500 }
    );
  }
}
