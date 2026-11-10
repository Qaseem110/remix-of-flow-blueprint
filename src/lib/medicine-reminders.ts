import type { PrescriptionItem } from "./store";

/** Suggest dose times (24h "HH:mm") from a free-text frequency such as "Twice daily" or "1+0+1". */
export function suggestTimes(frequency: string): string[] {
  const f = frequency.toLowerCase();
  const pattern = f.match(/^\s*(\d)\s*[+\-]\s*(\d)\s*[+\-]\s*(\d)\s*$/);
  if (pattern) return (["08:00", "14:00", "21:00"] as const).filter((_, i) => Number(pattern[i + 1]) > 0);
  if (/four|4\s*times|qid|every\s*6/.test(f)) return ["06:00", "12:00", "18:00", "00:00"];
  if (/three|thrice|3\s*times|tds|tid|every\s*8/.test(f)) return ["08:00", "14:00", "21:00"];
  if (/twice|two|2\s*times|bd|bid|every\s*12/.test(f)) return ["08:00", "20:00"];
  if (/night|bedtime|hs\b/.test(f)) return ["21:00"];
  if (/morning/.test(f)) return ["08:00"];
  if (/once|daily|1\s*time|od\b/.test(f)) return ["09:00"];
  return [];
}

/** Number of days from a free-text duration ("7 days", "2 weeks", "1 month"); defaults to 7. */
export function durationDays(duration: string): number {
  const m = duration.toLowerCase().match(/(\d+)\s*(day|week|month)?/);
  if (!m) return 7;
  const n = Number(m[1]);
  return m[2]?.startsWith("week") ? n * 7 : m[2]?.startsWith("month") ? n * 30 : n;
}

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Doses whose time arrived within the last `windowMin` minutes and that fall inside the course. */
export function dueDoses(rx: PrescriptionItem[], startedAt: string, now: Date, windowMin = 60) {
  const start = new Date(startedAt);
  start.setHours(0, 0, 0, 0);
  const out: { key: string; item: PrescriptionItem; time: string }[] = [];
  rx.forEach((item, i) => {
    const end = new Date(start);
    end.setDate(end.getDate() + durationDays(item.duration));
    (item.times ?? []).forEach((t) => {
      const [h, m] = t.split(":").map(Number);
      const at = new Date(now);
      at.setHours(h, m, 0, 0);
      const late = (now.getTime() - at.getTime()) / 60000;
      if (late >= 0 && late < windowMin && at >= start && at < end) out.push({ key: `${i}|${localDate(at)}|${t}`, item, time: t });
    });
  });
  return out;
}
