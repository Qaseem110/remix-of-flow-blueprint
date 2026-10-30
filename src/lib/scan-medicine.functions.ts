import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MedicineScan = { name: string; formula: string; strength: string; form: string; packSize: string; price: number | null };

/** Reads a photo of a medicine box/strip with AI and returns name, strength, form, pack size and printed price. */
export const scanMedicine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { dataUrl: string }) => {
    if (typeof d?.dataUrl !== "string" || !/^data:image\/(png|jpeg|jpg|webp);base64,/.test(d.dataUrl)) throw new Error("Please upload a photo (JPG, PNG or WEBP)");
    if (d.dataUrl.length > 10_000_000) throw new Error("Photo too large");
    return { dataUrl: d.dataUrl };
  })
  .handler(async ({ data }): Promise<MedicineScan | null> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return null;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions: "You read photos of medicine packaging (boxes, strips, bottles) from Pakistan. Extract: brand name, generic formula, strength (e.g. '500mg', '250mg/5ml'), dosage form (Tablet, Capsule, Syrup, Injection, Cream, Drops, Other), pack size (e.g. '10 tablets', '120ml'), and the printed retail price in PKR as a number (null if not visible). Use empty strings for anything not visible.",
        input: [{ role: "user", content: [{ type: "input_text", text: "Read this medicine package." }, { type: "input_image", image_url: data.dataUrl }] }],
        text: { format: { type: "json_schema", name: "medicine", strict: true, schema: {
          type: "object", additionalProperties: false, required: ["name", "formula", "strength", "form", "packSize", "price"],
          properties: { name: { type: "string" }, formula: { type: "string" }, strength: { type: "string" }, form: { type: "string" }, packSize: { type: "string" }, price: { type: ["number", "null"] } },
        } } },
      }),
    });
    if (!res.ok) { console.error("scanMedicine AI error", res.status, await res.text()); return null; }
    try {
      const reader = res.body!.getReader(); const dec = new TextDecoder(); let buf = "", txt = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const l of lines) {
          if (!l.startsWith("data:")) continue;
          const p = l.slice(5).trim(); if (!p || p === "[DONE]") continue;
          try { const ev = JSON.parse(p); if (ev.type === "response.output_text.delta") txt += ev.delta; } catch { /* skip */ }
        }
      }
      const o = JSON.parse(txt);
      const s = (v: unknown) => String(v ?? "").slice(0, 120);
      return { name: s(o.name), formula: s(o.formula), strength: s(o.strength), form: s(o.form), packSize: s(o.packSize), price: typeof o.price === "number" ? o.price : null };
    } catch { return null; }
  });
