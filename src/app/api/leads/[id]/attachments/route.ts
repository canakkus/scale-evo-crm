import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findAccessibleLead } from "@/lib/workspace";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { id } = await params;
    const lead = await findAccessibleLead(user, id);
    if (!lead) {
      return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });
    }

    const attachments = await prisma.leadAttachment.findMany({
      where: { leadId: id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ attachments });
  } catch (error) {
    console.error("[GET /api/leads/[id]/attachments] Error:", error);
    return NextResponse.json({ error: "Fehler beim Laden der Anhänge." }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOptionalUser();
    if (!user) {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
    }

    const { id } = await params;
    const lead = await findAccessibleLead(user, id);
    if (!lead) {
      return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404 });
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const singleFile = formData.get("file") as File | null;

    const fileList: File[] = [];
    if (files && files.length > 0) {
      fileList.push(...files);
    } else if (singleFile) {
      fileList.push(singleFile);
    }

    if (fileList.length === 0) {
      return NextResponse.json({ error: "Keine Datei übertragen." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const bucketName = "lead-attachments";
    const createdAttachments = [];

    for (const file of fileList) {
      // Validate that it is an image
      if (!file.type.startsWith("image/")) {
        continue;
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Clean file name
      const safeName = (file.name || "screenshot.png")
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "_");
      const storagePath = `leads/${id}/${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${safeName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(storagePath, buffer, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error("[Upload Error]", uploadError);
        throw new Error(`Upload fehlgeschlagen: ${uploadError.message}`);
      }

      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(storagePath);

      const publicUrl = urlData.publicUrl;

      const attachment = await prisma.leadAttachment.create({
        data: {
          leadId: id,
          url: publicUrl,
          fileName: file.name || "Screenshot",
          fileSize: file.size,
          mimeType: file.type,
        },
      });

      createdAttachments.push(attachment);
    }

    return NextResponse.json({ attachments: createdAttachments });
  } catch (error: any) {
    console.error("[POST /api/leads/[id]/attachments] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Fehler beim Hochladen der Datei(en)." },
      { status: 500 }
    );
  }
}
