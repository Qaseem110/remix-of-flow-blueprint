import { createServerFn } from "@tanstack/react-start";
import { generateResponse, GatewayError } from "@lovable.dev/ai-gateway";
import { z } from "zod";

export type SymptomMatch = { specializations: string[]; doctorIds: string[]; advice: string; urgent: boolean; error?: string };

const input = z.object({
  symptoms: z.string().trim().min(3).max(500),
  doctors: z.array(z.object({ id: z.string().max(80), specialization: z.string().max(80) })).max(300),
});

/** Public helper: suggests which specialists fit a patient's described illness. Not a diagnosis. */
export const suggestDoctors = createServerFn({ method: "POST" })
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data }): Promise<SymptomMatch> => {
    const specs = [...new Set(data.doctors.map((d) => d.specialization).filter(Boolean))];
    try {
      const res = await generateResponse({
        model: "openai/gpt-6-astra",
        reasoning: { effort: "low" },
        instructions: "You help patients in Pakistan choose which kind of doctor to see. The patient may write in English, Urdu or Roman Urdu. Pick 1-3 specializations ONLY from the provided list that best fit the illness or symptoms (General Physician is a good fallback if listed). Write short advice (max 2 sentences) in the same language the patient used, never a diagnosis or medicine. Set urgent true for emergency signs (chest pain, severe breathing trouble, stroke signs, heavy bleeding, unconsciousness) and then tell them to go to the nearest emergency now.",
        input: [{ role: "user", content: [{ type: "input_text", text: `Available specializations: ${JSON.stringify(specs)}\nPatient wrote: ${data.symptoms}` }] }],
        text: { format: { type: "json_schema", name: "match", strict: true, schema: {
          type: "object", additionalProperties: false, required: ["specializations", "advice", "urgent"],
          properties: { specializations: { type: "array", items: { type: "string" } }, advice: { type: "string" }, urgent: { type: "boolean" } },
        } } },
      });
      let txt = "";
      for (const item of res.output ?? []) if (item.type === "message") for (const c of item.content) if (c.type === "output_text") txt += c.text;
      const o = JSON.parse(txt) as { specializations: string[]; advice: string; urgent: boolean };
      const chosen = o.specializations.filter((s) => specs.includes(s)).slice(0, 3);
      const doctorIds = data.doctors.filter((d) => chosen.includes(d.specialization)).map((d) => d.id);
      return { specializations: chosen, doctorIds, advice: String(o.advice).slice(0, 400), urgent: !!o.urgent };
    } catch (e) {
      console.error("suggestDoctors failed", e instanceof GatewayError ? `${e.code} ${e.httpStatus}` : e);
      return { specializations: [], doctorIds: [], advice: "", urgent: false, error: "The assistant is busy right now. Please try again in a moment." };
    }
  });
