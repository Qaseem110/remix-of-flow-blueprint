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
      ? { type: "input_file", filename: data.fileName || "report.pdf", file_data: data.dataUrl }
      : { type: "input_image", image_url: data.dataUrl };
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions: "You read medical documents. Look ONLY at the content printed inside the document and IGNORE the uploaded file name. Extract the report name from the document's own heading/test name (short, e.g. 'MRI Brain', 'Complete Blood Count (CBC)', 'X-Ray Chest', 'Prescription'), the date printed on the report as YYYY-MM-DD (empty string if none), and its type.",
        input: [{ role: "user", content: [{ type: "input_text", text: "Read this medical document and name it by what is written inside it." }, filepart] }],
        text: { format: { type: "json_schema", name: "report_info", strict: true, schema: {
          type: "object", additionalProperties: false, required: ["title", "reportDate", "kind"],
          properties: { title: { type: "string" }, reportDate: { type: "string" }, kind: { type: "string", enum: ["Lab Report", "Prescription", "Radiology", "Referral", "Other"] } },
        } } },
      }),
    });
    if (!res.ok) { console.error("readReport AI error", res.status, await res.text()); return null; }
    try {
      // Read the SSE stream and collect the output text.
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
      const date = /^\d{4}-\d{2}-\d{2}$/.test(o.reportDate) ? o.reportDate : "";
      return { title: String(o.title ?? "").slice(0, 120), reportDate: date, kind: String(o.kind ?? "Other") };
    } catch { return null; }
  });
