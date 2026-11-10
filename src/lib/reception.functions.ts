import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReceptionPermissions = { book: boolean; queue: boolean; checkIn: boolean; cancel: boolean };

async function assertDoctor(supabase: any, userId: string) {
  const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (error || data?.role !== "doctor") throw new Error("Only doctors can manage reception accounts");
}

/** Doctor creates a reception login tied to their own clinic. */
export const createReceptionist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { name: string; email: string; phone: string; password: string; permissions: ReceptionPermissions }) => {
    const email = String(i.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email");
    if (String(i.password ?? "").length < 8) throw new Error("Password must be at least 8 characters");
    if (String(i.name ?? "").trim().length < 2) throw new Error("Enter the receptionist's name");
    const p = i.permissions ?? ({} as ReceptionPermissions);
    return { name: i.name.trim().slice(0, 80), email, phone: String(i.phone ?? "").trim().slice(0, 20), password: i.password, permissions: { book: !!p.book, queue: !!p.queue, checkIn: !!p.checkIn, cancel: !!p.cancel } };
  })
  .handler(async ({ data, context }) => {
    await assertDoctor(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email, password: data.password, email_confirm: true,
      user_metadata: { name: data.name, phone: data.phone }, app_metadata: { role: "receptionist" },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create the account");
    const { error: e2 } = await supabaseAdmin.from("receptionists").insert({ id: created.user.id, doctor_id: context.userId, data: { name: data.name, email: data.email, phone: data.phone, permissions: data.permissions } });
    if (e2) { await supabaseAdmin.auth.admin.deleteUser(created.user.id); throw new Error(e2.message); }
    return { id: created.user.id };
  });

/** Doctor removes one of their reception logins. */
export const removeReceptionist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => ({ id: String(i.id) }))
  .handler(async ({ data, context }) => {
    await assertDoctor(context.supabase, context.userId);
    const { data: row } = await context.supabase.from("receptionists").select("doctor_id").eq("id", data.id).maybeSingle();
    if (row?.doctor_id !== context.userId) throw new Error("Not your reception account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("receptionists").delete().eq("id", data.id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
