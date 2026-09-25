/**
 * ============================================================
 * BENUTZER-PROVISIONIERUNG  —  npm run users:provision
 * ============================================================
 * Legt die in der .env hinterlegten Benutzer an:
 *   1. als Supabase-Auth-Benutzer (via Service-Role-Key)
 *   2. als Datensatz in der eigenen User-Tabelle (Prisma)
 *
 * NUR LOKAL AUSFÜHREN. Der Service-Role-Key umgeht sämtliche
 * Row-Level-Security und gehört niemals in eine Deployment-Umgebung.
 *
 * Erwartete Variablen (pro Benutzer durchnummeriert, ab 1):
 *   LOCALCRM_USER_1_EMAIL / _NAME / _PASSWORD
 * ============================================================
 */

import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type PlannedUser = { index: number; email: string; name: string; password: string };

function collectUsers(): PlannedUser[] {
  const users: PlannedUser[] = [];
  for (let index = 1; index <= 10; index++) {
    const email = process.env[`LOCALCRM_USER_${index}_EMAIL`]?.trim();
    const password = process.env[`LOCALCRM_USER_${index}_PASSWORD`]?.trim();
    if (!email || !password) continue;
    const name = process.env[`LOCALCRM_USER_${index}_NAME`]?.trim() || email.split("@")[0];
    users.push({ index, email: email.toLowerCase(), name, password });
  }
  return users;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl) {
    console.error("✗ NEXT_PUBLIC_SUPABASE_URL fehlt in der .env.");
    process.exit(1);
  }
  if (!serviceRoleKey) {
    console.error(
      "✗ SUPABASE_SERVICE_ROLE_KEY fehlt in der .env.\n" +
        "  Zu finden im Supabase-Dashboard unter Project Settings → API → service_role.\n" +
        "  Nur lokal setzen, niemals in Vercel hinterlegen.",
    );
    process.exit(1);
  }

  const planned = collectUsers();
  if (planned.length === 0) {
    console.error(
      "✗ Keine Benutzer konfiguriert.\n" +
        "  Setze mindestens LOCALCRM_USER_1_EMAIL und LOCALCRM_USER_1_PASSWORD in der .env.",
    );
    process.exit(1);
  }

  const allowed = (process.env.LOCALCRM_ALLOWED_USER_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`\n${planned.length} Benutzer werden provisioniert …\n`);

  let created = 0;
  let updated = 0;

  for (const user of planned) {
    try {
      // Bestehenden Auth-Benutzer suchen (createUser wirft sonst bei Duplikaten).
      const { data: list, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) throw listError;

      const existing = list.users.find((candidate) => candidate.email?.toLowerCase() === user.email);
      let authId: string;

      if (existing) {
        const { error } = await supabase.auth.admin.updateUserById(existing.id, {
          password: user.password,
          user_metadata: { displayName: user.name },
        });
        if (error) throw error;
        authId = existing.id;
        updated++;
        console.log(`  ↻ ${user.email} — Auth-Benutzer aktualisiert`);
      } else {
        const { data, error } = await supabase.auth.admin.createUser({
          email: user.email,
          password: user.password,
          email_confirm: true,
          user_metadata: { displayName: user.name },
        });
        if (error) throw error;
        authId = data.user.id;
        created++;
        console.log(`  ✓ ${user.email} — Auth-Benutzer angelegt`);
      }

      await prisma.user.upsert({
        where: { id: authId },
        update: { email: user.email, displayName: user.name, active: true },
        create: { id: authId, email: user.email, displayName: user.name, active: true },
      });
      console.log(`    └─ CRM-Datensatz gesetzt (${authId})`);

      if (allowed.length > 0 && !allowed.includes(user.email)) {
        console.warn(
          `    ⚠ ${user.email} steht NICHT in LOCALCRM_ALLOWED_USER_EMAILS — Login wird abgelehnt.`,
        );
      }
    } catch (error) {
      console.error(`  ✗ ${user.email} fehlgeschlagen:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(`\nFertig. ${created} neu angelegt, ${updated} aktualisiert.\n`);
}

main()
  .catch((error) => {
    console.error("Provisionierung abgebrochen:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
