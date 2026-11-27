/** Offline fallback when the AI assistant is unavailable: keyword → specialization hints (English + Roman Urdu). */
const MAP: [RegExp, string[]][] = [
  [/chest|heart|dil|seen[ae]|bp|blood pressure|palpitat/i, ["Cardiologist", "Cardiology"]],
  [/head|sir|migraine|dizz|chakk|fits|seizure|numb|stroke|nerve/i, ["Neurologist", "Neurology"]],
  [/skin|rash|khar|itch|acne|daan|pimple|eczema|hair|baal/i, ["Dermatologist", "Dermatology"]],
  [/knee|ghutn|joint|jor|back|kamar|bone|haddi|fracture|spine/i, ["Orthopedic", "Orthopedics", "Orthopedic Surgeon"]],
  [/cough|khans|khaans|breath|saans|asthma|dama|lung|phephr/i, ["Pulmonologist", "Pulmonology"]],
  [/eye|aankh|ankh|vision|nazar/i, ["Ophthalmologist", "Ophthalmology", "Eye Specialist"]],
  [/tooth|teeth|daant|dant|gum|masoor/i, ["Dentist", "Dentistry"]],
  [/child|bach|baby|infant/i, ["Pediatrician", "Pediatrics"]],
  [/stomach|pait|pet|acidity|diarr|dast|vomit|ulti|liver|jigar/i, ["Gastroenterologist", "Gastroenterology"]],
  [/pregnan|period|hamal|haiz|gyn/i, ["Gynecologist", "Gynecology"]],
  [/sugar|diabet|thyroid/i, ["Endocrinologist", "Endocrinology"]],
  [/ear|kaan|nose|naak|throat|gala|gal[ae]/i, ["ENT Specialist", "ENT"]],
  [/anxiety|depress|stress|pareshan|neend|sleep/i, ["Psychiatrist", "Psychiatry", "Psychologist"]],
];
const URGENT = /chest pain|seen[ae] (me|mein) dard|saans nahi|can't breathe|unconscious|behosh|bleeding|khoon beh|stroke|faalij|falij/i;

export function keywordMatch(text: string, specs: string[]) {
  const lower = specs.map((s) => s.toLowerCase());
  const chosen = new Set<string>();
  for (const [re, names] of MAP) if (re.test(text)) for (const n of names) { const i = lower.findIndex((s) => s.includes(n.toLowerCase()) || n.toLowerCase().includes(s)); if (i >= 0) chosen.add(specs[i]); }
  if (!chosen.size) { const gp = specs.find((s) => /general|physician|family/i.test(s)); if (gp) chosen.add(gp); }
  return { specializations: [...chosen].slice(0, 3), urgent: URGENT.test(text) };
}
