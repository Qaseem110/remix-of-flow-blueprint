import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReportInfo = { title: string; reportDate: string; kind: string };

/** Reads an uploaded medical document (image/PDF) with AI and returns its name, date and type. */
export const readReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { dataUrl: string; fileName: string }) => {
    if (typeof d?.dataUrl !== "string" || !/^data:(image\/(png|jpeg|jpg|webp)|application\/pdf);base64,/.test(d.dataUrl)) throw new Error("Unsupported file");
    if (d.dataUrl.length > 14_500_000) throw new Error("File too large");
    return { dataUrl: d.dataUrl, fileName: String(d.fileName ?? "").slice(0, 200) };
  })
  .handler(async ({ data }): Promise<ReportInfo | null> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return null;
    const isPdf = data.dataUrl.startsWith("data:application/pdf");
    const filepart = isPdf
      ? { type: "file", file: { filename: data.fileName || "report.pdf", file_data: data.dataUrl } }
      : { type: "image_url", image_url: { url: data.dataUrl } };
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: 'You read medical documents. Reply ONLY with JSON: {"title": short report name e.g. "Complete Blood Count (CBC)" or "Prescription", "reportDate": date printed on the report as YYYY-MM-DD or "" if none, "kind": one of "Lab Report","Prescription","Radiology","Referral","Other"}.' },
          { role: "user", content: [{ type: "text", text: `File name: ${data.fileName}` }, filepart] },
        ],
      }),
    });
    if (!res.ok) { console.error("readReport AI error", res.status, await res.text()); return null; }
    try {
      const j = await res.json();
      const txt: string = j.choices?.[0]?.message?.content ?? "";
      const o = JSON.parse(txt.replace(/^```(json)?|```$/g, "").trim());
      const date = /^\d{4}-\d{2}-\d{2}$/.test(o.reportDate) ? o.reportDate : "";
      return { title: String(o.title ?? "").slice(0, 120), reportDate: date, kind: String(o.kind ?? "Other").slice(0, 30) };
    } catch { return null; }
  });
