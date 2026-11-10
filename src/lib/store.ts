/**
 * Mock data layer (in-memory). Every exported function mirrors a future
 * backend call so it can be swapped for self-hosted Supabase later.
 */
import { distanceKm, travelMinutes } from "./geo";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { addDays, addMinutes, format, parse } from "date-fns";
import { fmtTime } from "@/lib/utils";
import { readReport } from "@/lib/read-report.functions";
import { scheduleShifts, shiftTiming, timeMinutes, validateShifts, weekdayShifts, type Shift } from "@/lib/schedule";
export { scheduleShifts, weekdayShifts, type Shift } from "@/lib/schedule";

export type Role = "patient" | "doctor" | "admin" | "pharmacy";

export interface Pharmacy {
  userId: string;
  storeName: string;
  phone: string;
  address: string;
  city: string;
  lat?: number;
  lng?: number;
  hours?: string;
}
export interface Medicine {
  id: string;
  pharmacyId: string;
  name: string;
  formula?: string;
  strength: string;
  form: string;
  packSize?: string;
  price: number;
  inStock: boolean;
  image?: string;
  updatedAt: string;
}
export type ConsultType = "online" | "clinic";
export type AppointmentStatus =
  | "Pending"
  | "Confirmed"
  | "Checked-In"
  | "Waiting"
  | "Ready to Join"
  | "In Consultation"
  | "Completed"
  | "Cancelled"
  | "No Show"
  | "Rescheduled";

export const ALL_STATUSES: AppointmentStatus[] = [
  "Pending", "Confirmed", "Checked-In", "Waiting", "Ready to Join",
  "In Consultation", "Completed", "Cancelled", "No Show", "Rescheduled",
];

export interface User {
  id: string;
  role: Role;
  name: string;
  email: string;
  phone: string;
  password: string;
  active: boolean;
  createdAt: string;
}

export type VerificationStatus = "Pending Verification" | "Approved" | "Rejected";

export interface DoctorProfile {
  userId: string;
  avatar?: string;
  specialization: string;
  qualification: string;
  licenseNumber: string;
  experience: number;
  fee: number;
  languages: string[];
  clinicName: string;
  clinicAddress: string;
  clinicLat?: number; // clinic GPS location, set by the doctor
  clinicLng?: number;
  city: string;
  about: string;
  online: boolean;
  clinic: boolean;
  verification: VerificationStatus;
  services: string[];
}

export interface PatientProfile {
  userId: string;
  dob: string;
  gender: string;
  bloodGroup?: string;
  address?: string;
  emergencyContact?: string;
  members?: FamilyMember[]; // linked family/friend profiles managed by this account
}

export interface FamilyMember {
  id: string;
  name: string;
  relation: string;
  dob?: string;
  gender?: string;
}

export interface Availability {
  doctorId: string;
  days: number[]; // 0=Sun..6=Sat
  start: string; // HH:mm
  end: string;
  duration: number; // minutes
  dailyLimit?: number; // appointments shared across online and clinic visits
  consultMinutes?: number; // minutes the doctor spends per patient
  patientsPerSlot?: number; // patients seen together at the same time
  weeklyShifts?: Record<string, Shift[]>;
  dateOverrides?: Record<string, Shift[]>;
  blocked?: string[]; // "yyyy-MM-dd HH:mm" slots the doctor marked unavailable
  blockedDays?: string[]; // "yyyy-MM-dd" whole days off
}

export interface DocFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  url: string;
  kind: string; // Report, Prescription, Summary, Referral, Other
  uploadedBy: Role;
  uploadedAt: string;
  path?: string; // server storage path once uploaded
  title?: string; // report name read from the document
  reportDate?: string; // date printed on the report (yyyy-MM-dd)
}

export interface Appointment {
  id: string;
  doctorId: string;
  patientId: string;
  type: ConsultType;
  date: string; // yyyy-MM-dd
  time: string; // HH:mm
  reason: string;
  status: AppointmentStatus;
  queueNumber: number;
  documents: DocFile[];
  createdAt: string;
  checkedInAt?: string;
  cancelledBy?: Role;
  cancelReason?: string;
  rescheduledTo?: string;
  rescheduledFrom?: string;
  followUpOf?: string;
  payment?: "cash" | "card";
  memberId?: string; // set when booked for a linked family member
  memberName?: string;
  queueOrder?: number; // set when a doctor moves a patient within the queue
  patientLat?: number; // where the patient will travel from, marked at booking
  patientLng?: number;
  leaveAlertAt?: string; // when the 'time to leave' alert was sent
}

export interface PrescriptionItem {
  medicine: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface Consultation {
  appointmentId: string;
  doctorId: string;
  patientId: string;
  symptoms: string;
  diagnosis: string;
  privateNotes: string; // doctor-only
  summary: string; // patient-visible
  prescription: PrescriptionItem[];
  documents: DocFile[];
  followUpRequired: boolean;
  followUpTiming: string;
  completedAt?: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
  link?: string;
}

export interface Settings {
  doctorVerification: boolean;
  checkInMethods: { appointmentId: boolean; phone: boolean };
  joinWindowMinutes: number;
  allowedFileTypes: string[];
  turnApproachingAhead: number;
}

export type PaymentMethod = "cash" | "card";
export interface Review {
  id: string;
  appointmentId: string;
  doctorId: string;
  patientId: string;
  rating: number;
  comment: string;
  at: string;
}

interface State {
  users: User[];
  doctors: DoctorProfile[];
  patients: PatientProfile[];
  availability: Availability[];
  appointments: Appointment[];
  consultations: Consultation[];
  notifications: Notification[];
  settings: Settings;
  reviews: Review[];
  pharmacies: Pharmacy[];
  medicines: Medicine[];
  sessionUserId: string | null;
}

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const now = () => new Date().toISOString();
export const todayStr = () => format(new Date(), "yyyy-MM-dd");

// ---------- Seed ----------
function seed(): State {
  const t = todayStr();
  const users: User[] = [
    { id: "u-admin", role: "admin", name: "System Admin", email: "admin@demo.com", phone: "+218910000000", password: "demo123", active: true, createdAt: now() },
    { id: "u-pat1", role: "patient", name: "Sara Ahmed", email: "patient@demo.com", phone: "+218911111111", password: "demo123", active: true, createdAt: now() },
    { id: "u-pat2", role: "patient", name: "Omar Khaled", email: "omar@demo.com", phone: "+218912222222", password: "demo123", active: true, createdAt: now() },
    { id: "u-pat3", role: "patient", name: "Lina Mansour", email: "lina@demo.com", phone: "+218913333333", password: "demo123", active: true, createdAt: now() },
    { id: "u-doc1", role: "doctor", name: "Dr. Yusuf Haddad", email: "doctor@demo.com", phone: "+218920000001", password: "demo123", active: true, createdAt: now() },
    { id: "u-doc2", role: "doctor", name: "Dr. Mariam Saleh", email: "mariam@demo.com", phone: "+218920000002", password: "demo123", active: true, createdAt: now() },
    { id: "u-doc3", role: "doctor", name: "Dr. Karim Nouri", email: "karim@demo.com", phone: "+218920000003", password: "demo123", active: true, createdAt: now() },
    { id: "u-doc4", role: "doctor", name: "Dr. Huda Ben Ali", email: "huda@demo.com", phone: "+218920000004", password: "demo123", active: true, createdAt: now() },
    { id: "u-doc5", role: "doctor", name: "Dr. Tarek Fituri", email: "tarek@demo.com", phone: "+218920000005", password: "demo123", active: true, createdAt: now() },
    { id: "u-doc6", role: "doctor", name: "Dr. Nadia Zidan", email: "nadia@demo.com", phone: "+218920000006", password: "demo123", active: true, createdAt: now() },
  ];
  const d = (userId: string, o: Partial<DoctorProfile>): DoctorProfile => ({
    userId, specialization: "General Practice", qualification: "MBBS", licenseNumber: "LMC-" + userId.slice(-1) + "2041",
    experience: 8, fee: 50, languages: ["Arabic", "English"], clinicName: "Sahoolat Clinic", clinicAddress: "Omar Mukhtar St.",
    city: "Tripoli", about: "", online: true, clinic: true, verification: "Approved", services: [], ...o,
  });
  const doctors: DoctorProfile[] = [
    d("u-doc1", { specialization: "Cardiology", qualification: "MD, FACC", experience: 14, fee: 80, about: "Cardiologist focused on preventive heart care, hypertension and arrhythmia management.", services: ["ECG review", "Hypertension", "Chest pain"] }),
    d("u-doc2", { specialization: "Dermatology", qualification: "MD Dermatology", experience: 9, fee: 60, city: "Benghazi", clinicName: "SkinWell Center", about: "Medical and cosmetic dermatology, acne, eczema and skin screening.", languages: ["Arabic", "English", "French"], services: ["Acne", "Eczema", "Mole check"] }),
    d("u-doc3", { specialization: "Pediatrics", qualification: "MBBS, DCH", experience: 11, fee: 45, about: "Caring for children from newborn to adolescence.", online: false, services: ["Vaccination", "Growth check"] }),
    d("u-doc4", { specialization: "General Practice", qualification: "MBBS", experience: 6, fee: 35, clinic: false, about: "Online family medicine for everyday health concerns.", services: ["Cold & flu", "Follow-ups"] }),
    d("u-doc5", { specialization: "Orthopedics", qualification: "MS Ortho", experience: 17, fee: 90, city: "Misrata", clinicName: "BoneCare Clinic", about: "Joint pain, sports injuries and spine care.", services: ["Knee pain", "Back pain"] }),
    d("u-doc6", { specialization: "Neurology", qualification: "MD Neurology", experience: 12, fee: 85, about: "Headache, epilepsy and nerve disorders.", verification: "Pending Verification", services: ["Migraine", "Epilepsy"] }),
  ];
  const patients: PatientProfile[] = [
    { userId: "u-pat1", dob: "1994-04-12", gender: "Female", bloodGroup: "O+", address: "Hay Al Andalus, Tripoli", emergencyContact: "Ahmed — +218915555555" },
    { userId: "u-pat2", dob: "1988-09-02", gender: "Male", bloodGroup: "A+" },
    { userId: "u-pat3", dob: "2001-01-21", gender: "Female" },
  ];
  const availability: Availability[] = doctors.map((x, i) => ({
    doctorId: x.userId, days: [0, 1, 2, 3, 4, 6], start: i % 2 ? "10:00" : "08:00", end: i % 2 ? "18:00" : "16:00", duration: [30, 20, 30, 15, 45, 30][i],
  }));
  const appt = (o: Partial<Appointment> & Pick<Appointment, "id" | "patientId" | "time">): Appointment => ({
    doctorId: "u-doc1", type: "clinic", date: t, reason: "Check-up", status: "Confirmed", queueNumber: 0, documents: [], createdAt: now(), ...o,
  });
  const appointments: Appointment[] = [
    appt({ id: "APT-1001", patientId: "u-pat2", time: "08:00", status: "Completed", queueNumber: 1, reason: "Palpitations" }),
    appt({ id: "APT-1002", patientId: "u-pat3", time: "08:30", status: "Checked-In", checkedInAt: now(), queueNumber: 2, reason: "Chest tightness" }),
    appt({ id: "APT-1003", patientId: "u-pat1", time: "09:00", type: "online", queueNumber: 3, reason: "Blood pressure follow-up" }),
    appt({ id: "APT-1004", patientId: "u-pat2", time: "09:30", queueNumber: 4, reason: "ECG review" }),
    appt({ id: "APT-0900", patientId: "u-pat1", doctorId: "u-doc2", date: format(addDays(new Date(), -20), "yyyy-MM-dd"), time: "11:00", type: "online", status: "Completed", queueNumber: 1, reason: "Skin rash" }),
  ];
  const consultations: Consultation[] = [
    { appointmentId: "APT-1001", doctorId: "u-doc1", patientId: "u-pat2", symptoms: "Intermittent palpitations", diagnosis: "Benign PVCs", privateNotes: "Consider Holter if persists.", summary: "Heart rhythm is mostly normal. Reduce caffeine.", prescription: [], documents: [], followUpRequired: false, followUpTiming: "", completedAt: now() },
    { appointmentId: "APT-0900", doctorId: "u-doc2", patientId: "u-pat1", symptoms: "Itchy red rash on forearm", diagnosis: "Contact dermatitis", privateNotes: "Possible nickel allergy.", summary: "Your rash is an allergic skin reaction. Avoid metal watch straps and apply the cream twice daily.", prescription: [{ medicine: "Hydrocortisone 1% cream", dosage: "Thin layer", frequency: "Twice daily", duration: "7 days", instructions: "Apply to affected area only" }, { medicine: "Cetirizine 10mg", dosage: "1 tablet", frequency: "Once at night", duration: "5 days", instructions: "May cause drowsiness" }], documents: [], followUpRequired: true, followUpTiming: "In 2 weeks if not improved", completedAt: format(addDays(new Date(), -20), "yyyy-MM-dd") + "T11:30:00Z" },
  ];
  const notifications: Notification[] = [
    { id: uid("N"), userId: "u-pat1", title: "Appointment confirmed", body: "APT-1003 with Dr. Yusuf Haddad today at 09:00 (Online).", at: now(), read: false, link: "/patient/appointments/APT-1003" },
    { id: uid("N"), userId: "u-pat1", title: "Follow-up reminder", body: "Dr. Mariam Saleh recommended a follow-up: In 2 weeks if not improved.", at: now(), read: false, link: "/patient/records" },
  ];
  return {
    users, doctors, patients, availability, appointments, consultations, notifications,
    settings: { doctorVerification: true, checkInMethods: { appointmentId: true, phone: true }, joinWindowMinutes: 10, allowedFileTypes: ["pdf", "jpg", "jpeg", "png"], turnApproachingAhead: 1 },
    reviews: [],
    pharmacies: [], medicines: [],
    sessionUserId: null,
  };
}

// ---------- Store plumbing ----------
/** Supabase is used everywhere except unit tests (which run on the seed data). */
const SB = import.meta.env.MODE !== "test";
const DEFAULT_SETTINGS: Settings = { doctorVerification: true, checkInMethods: { appointmentId: true, phone: true }, joinWindowMinutes: 10, allowedFileTypes: ["pdf", "jpg", "jpeg", "png"], turnApproachingAhead: 1 };
const emptyState = (): State => ({ users: [], doctors: [], patients: [], availability: [], appointments: [], consultations: [], notifications: [], settings: DEFAULT_SETTINGS, reviews: [], pharmacies: [], medicines: [], sessionUserId: null });
let state: State = SB ? emptyState() : seed();
let ready = !SB;
let hydrating = false;
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
function set(fn: (s: State) => State) {
  const prev = state;
  state = fn(state);
  emit();
  if (SB && !hydrating) void syncDiff(prev, state);
}

// ---------- Supabase sync ----------
type TableKey = "users" | "doctors" | "patients" | "availability" | "appointments" | "consultations" | "notifications" | "reviews" | "pharmacies" | "medicines";
/* eslint-disable @typescript-eslint/no-explicit-any */
const TABLES: { key: TableKey; table: string; id: (x: any) => string; row: (x: any) => Record<string, unknown>; from: (r: any) => any }[] = [
  { key: "users", table: "profiles", id: (u) => u.id, row: (u) => { const { password: _p, ...d } = u; return { id: u.id, role: u.role, data: d }; }, from: (r) => ({ ...r.data, id: r.id, role: r.role, password: "" }) },
  { key: "doctors", table: "doctors", id: (d) => d.userId, row: (d) => ({ id: d.userId, data: d }), from: (r) => ({ ...r.data, userId: r.id }) },
  { key: "patients", table: "patients", id: (p) => p.userId, row: (p) => ({ id: p.userId, data: p }), from: (r) => ({ ...r.data, userId: r.id }) },
  { key: "availability", table: "availability", id: (a) => a.doctorId, row: (a) => ({ id: a.doctorId, data: a }), from: (r) => ({ ...r.data, doctorId: r.id }) },
  { key: "appointments", table: "appointments", id: (a) => a.id, row: (a) => ({ id: a.id, doctor_id: a.doctorId, patient_id: a.patientId, data: { ...a, documents: stripDocs(a.documents) } }), from: (r) => ({ documents: [], ...r.data, id: r.id }) },
  { key: "consultations", table: "consultations", id: (c) => c.appointmentId, row: (c) => ({ id: c.appointmentId, doctor_id: c.doctorId, patient_id: c.patientId, data: { ...c, documents: stripDocs(c.documents) } }), from: (r) => ({ prescription: [], documents: [], ...r.data, appointmentId: r.id }) },
  { key: "notifications", table: "notifications", id: (n) => n.id, row: (n) => ({ id: n.id, user_id: n.userId, data: n }), from: (r) => ({ ...r.data, id: r.id }) },
  { key: "pharmacies", table: "pharmacies", id: (p) => p.userId, row: (p) => ({ id: p.userId, data: p }), from: (r) => ({ ...r.data, userId: r.id }) },
  { key: "medicines", table: "medicines", id: (m) => m.id, row: (m) => ({ id: m.id, pharmacy_id: m.pharmacyId, data: m }), from: (r) => ({ ...r.data, id: r.id, pharmacyId: r.pharmacy_id }) },
  { key: "reviews", table: "reviews", id: (r) => r.id, row: (r) => ({ id: r.id, doctor_id: r.doctorId, patient_id: r.patientId, data: r }), from: (r) => ({ ...r.data, id: r.id }) },
];
/* eslint-enable @typescript-eslint/no-explicit-any */

async function reportSyncError(msg: string) {
  console.error("[sync]", msg);
  const { toast } = await import("sonner");
  toast.error("Could not save to server: " + msg);
}

/** Files picked in the browser, waiting to be uploaded to storage (by doc id). */
const pendingFiles = new Map<string, File>();
async function uploadDocs(x: { documents: DocFile[] }, appointmentId: string, strict = false) {
  const { supabase } = await import("./supabase");
  for (const d of x.documents ?? []) {
    const f = pendingFiles.get(d.id);
    if (!f || d.path) continue;
    const path = `${appointmentId}/${d.id}-${d.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("documents").upload(path, f, { contentType: f.type, upsert: true });
    if (error) { if (strict) throw new Error(`${d.name}: ${error.message}`); void reportSyncError(`${d.name}: ${error.message}`); continue; }
    d.path = path;
    pendingFiles.delete(d.id);
  }
}
const stripDocs = (docs: DocFile[] = []) => docs.map((d) => (d.path ? { ...d, url: "" } : d));

async function syncDiff(prev: State, next: State) {
  const { supabase } = await import("./supabase");
  for (const t of TABLES) {
    const a = prev[t.key] as unknown[], b = next[t.key] as unknown[];
    if (a === b) continue;
    const old = new Map(a.map((x) => [t.id(x), x]));
    if (t.key === "medicines") {
      const keep = new Set(b.map((x) => t.id(x)));
      for (const id of old.keys()) if (!keep.has(id)) { const { error } = await supabase.from(t.table).delete().eq("id", id); if (error) void reportSyncError(error.message); }
    }
    for (const x of b) {
      const o = old.get(t.id(x));
      if (o === x) continue;
      const hasDocs = t.key === "appointments" || t.key === "consultations";
      // Storage rules need the appointment row to exist, so new rows are written before uploading.
      if (hasDocs && o !== undefined) await uploadDocs(x as { documents: DocFile[] }, t.id(x));
      const row = t.row(x);
      const { error } = o === undefined
        ? await supabase.from(t.table).insert(row)
        : await supabase.from(t.table).update(row).eq("id", row.id as string);
      if (error) { void reportSyncError(error.message); continue; }
      if (hasDocs && o === undefined && (x as { documents: DocFile[] }).documents?.some((d) => pendingFiles.has(d.id))) {
        await uploadDocs(x as { documents: DocFile[] }, t.id(x));
        const r2 = t.row(x);
        const { error: e2 } = await supabase.from(t.table).update(r2).eq("id", r2.id as string);
        if (e2) void reportSyncError(e2.message);
      }
    }
  }
  if (prev.settings !== next.settings) {
    const { error } = await supabase.from("settings").update({ data: next.settings }).eq("id", "global");
    if (error) void reportSyncError(error.message);
  }
}

/** Load everything the signed-in (or anonymous) user may see from Supabase. */
let hydrationVersion = 0;
export async function hydrate(sessionUserId: string | null) {
  if (!SB) return;
  const version = ++hydrationVersion;
  const { supabase } = await import("./supabase");
  const results = await Promise.all([...TABLES.map((t) => supabase.from(t.table).select("*")), supabase.from("settings").select("*").eq("id", "global").maybeSingle()]);
  // A temporary connection failure must not erase an already-loaded account or its records.
  if (ready && state.sessionUserId === sessionUserId && results.some((r) => r.error)) return;
  const next = { ...state, sessionUserId } as State;
  TABLES.forEach((t, i) => {
    const r = results[i] as { data: unknown[] | null; error: { message: string } | null };
    if (r.error) console.error("[hydrate]", t.table, r.error.message);
    (next as unknown as Record<string, unknown>)[t.key] = (r.data ?? []).map(t.from);
  });
  const notes = await supabase.from("private_notes").select("id, notes");
  const noteMap = new Map((notes.data ?? []).map((n: { id: string; notes: string }) => [n.id, n.notes]));
  next.consultations = next.consultations.map((c) => ({ ...c, privateNotes: noteMap.get(c.appointmentId) ?? "" }));
  const paths = [...next.appointments, ...next.consultations].flatMap((x) => x.documents.map((d) => d.path)).filter((p): p is string => !!p);
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("documents").createSignedUrls(paths, 60 * 60 * 6);
    const urls = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
    const sign = (docs: DocFile[]) => docs.map((d) => (d.path && urls.get(d.path) ? { ...d, url: urls.get(d.path)! } : d));
    next.appointments = next.appointments.map((a) => ({ ...a, documents: sign(a.documents) }));
    next.consultations = next.consultations.map((c) => ({ ...c, documents: sign(c.documents) }));
  }
  const s = results[TABLES.length] as { data: { data: Settings } | null };
  next.settings = { ...DEFAULT_SETTINGS, ...(s.data?.data ?? {}) };
  if (version !== hydrationVersion) return;
  hydrating = true;
  state = next;
  ready = true;
  hydrating = false;
  emit();
}

let started = false;
/** Call once in the browser: restores the session and keeps data fresh. */
export function startSync() {
  if (!SB || started || typeof window === "undefined") return;
  started = true;
  void (async () => {
    const { supabase } = await import("./supabase");
    const { data } = await supabase.auth.getSession();
    await hydrate(data.session?.user.id ?? null);
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { ++hydrationVersion; hydrating = true; state = emptyState(); hydrating = false; emit(); }
    });
    let t: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(t); t = setTimeout(() => void hydrate(state.sessionUserId), 400); };
    const ch = supabase.channel("sahoolat-live");
    for (const table of ["appointments", "notifications", "consultations", "availability"]) ch.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    ch.subscribe();
    setInterval(() => { if (document.visibilityState === "visible") void hydrate(state.sessionUserId); }, 60000);
  })();
}
export const useReady = () => useSyncExternalStore(subscribe, () => ready, () => false);
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
/** Selector hook; result is recomputed only when the store state changes. */
export function useStore<T>(sel: (s: State) => T): T {
  const cache = useRef<{ s: State; v: T; sel: unknown } | null>(null);
  const get = useCallback(() => {
    if (!cache.current || cache.current.s !== state || cache.current.sel !== sel) {
      cache.current = { s: state, v: sel(state), sel };
    }
    return cache.current.v;
  }, [sel]);
  return useSyncExternalStore(subscribe, get, get);
}
export const getState = () => state;

function notify(userId: string, title: string, body: string, link?: string) {
  set((s) => ({ ...s, notifications: [{ id: uid("N"), userId, title, body, at: now(), read: false, link }, ...s.notifications] }));
}

// ---------- Selectors / helpers ----------
export const userById = (id: string) => state.users.find((u) => u.id === id);
export const doctorById = (id: string) => state.doctors.find((d) => d.userId === id);
export const patientById = (id: string) => state.patients.find((p) => p.userId === id);
export const useSession = () => useStore((s) => s.users.find((u) => u.id === s.sessionUserId) ?? null);

export function slotDateTime(a: { date: string; time: string }) {
  return parse(`${a.date} ${a.time}`, "yyyy-MM-dd HH:mm", new Date());
}

const BLOCKING: AppointmentStatus[] = ["Cancelled", "Rescheduled", "No Show"];

export function dailyCapacity(av: Availability, date?: string): number {
  if (date) return scheduleShifts(av, date).reduce((sum, shift) => sum + shift.capacity, 0);
  if (av.weeklyShifts) return Math.max(0, ...Object.values(av.weeklyShifts).map((shifts) => shifts.reduce((sum, shift) => sum + shift.capacity, 0)));
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  return av.dailyLimit ?? Math.max(1, Math.floor((minutes(av.end) - minutes(av.start)) / av.duration));
}

/** Auto-generated slots for a doctor on a date, booked ones excluded. */
export function getSlots(doctorId: string, date: string, s: State = state): { time: string; available: boolean; blocked?: boolean; booked?: boolean }[] {
  const av = s.availability.find((a) => a.doctorId === doctorId);
  if (!av) return [];
  const shifts = scheduleShifts(av, date);
  const dayOff = av.blockedDays?.includes(date) ?? false;
  const capacity = dailyCapacity(av, date);
  const bookedToday = s.appointments.filter((a) => a.doctorId === doctorId && a.date === date && !["Cancelled", "Rescheduled"].includes(a.status));
  const out: { time: string; available: boolean; blocked?: boolean; booked?: boolean }[] = [];
  const takenCount = new Map<string, number>();
  for (const a of bookedToday.filter((x) => !BLOCKING.includes(x.status))) takenCount.set(a.time, (takenCount.get(a.time) ?? 0) + 1);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Tripoli", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const localNow = `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
  for (const shift of shifts) {
  let cur = parse(`${date} ${shift.start}`, "yyyy-MM-dd HH:mm", new Date());
  const end = parse(`${date} ${shift.end}`, "yyyy-MM-dd HH:mm", new Date());
  const usedInShift = bookedToday.filter((a) => a.time >= shift.start && a.time < shift.end).length;
  const { step: interval, capacity: shiftCap, perSlot, slots } = shiftTiming(av, shift);
  for (let i = 0; i < slots && cur < end; i++) {
    const time = format(cur, "HH:mm");
    const blocked = dayOff || (av.blocked?.includes(`${date} ${time}`) ?? false);
    const booked = (takenCount.get(time) ?? 0) >= perSlot;
    out.push({ time, available: usedInShift < shiftCap && bookedToday.length < capacity && !booked && !blocked && `${date} ${time}` > localNow, blocked, booked });
    cur = addMinutes(cur, interval);
  }
  }
  return out;
}

export function nextBooking(doctorId: string, date: string, s: State = state) {
  const slot = getSlots(doctorId, date, s).find((x) => x.available);
  return slot ? { time: slot.time, queueNumber: nextQueueNumber(doctorId, date, s) } : null;
}

export function nextAvailableDate(doctorId: string): string | null {
  for (let i = 0; i < 30; i++) {
    const d = format(addDays(new Date(), i), "yyyy-MM-dd");
    if (getSlots(doctorId, d).some((x) => x.available)) return d;
  }
  return null;
}

/** Visible doctors: approved (or verification disabled) and active. */
export function visibleDoctors(s: State = state) {
  return s.doctors.filter((d) => {
    const u = s.users.find((x) => x.id === d.userId);
    return u?.active && (!s.settings.doctorVerification || d.verification === "Approved");
  });
}

// ---------- Queue ----------
const FINISHED: AppointmentStatus[] = ["Completed", "Cancelled", "No Show", "Rescheduled"];

export function dayAppointments(doctorId: string, date: string, s: State = state) {
  return s.appointments.filter((a) => a.doctorId === doctorId && a.date === date && a.status !== "Rescheduled" && a.status !== "Cancelled").sort((a, b) => a.time.localeCompare(b.time));
}

/** In the active queue: online confirmed/waiting/ready, clinic only once checked in. */
export function inActiveQueue(a: Appointment) {
  if (FINISHED.includes(a.status)) return false;
  if (a.type === "clinic") return ["Checked-In", "Waiting", "In Consultation"].includes(a.status);
  return ["Confirmed", "Waiting", "Ready to Join", "In Consultation"].includes(a.status);
}

/** Position key in the live queue (doctor can override the default order). */
export const queueKey = (a: Appointment) => a.queueOrder ?? a.queueNumber;
/** Patients waiting to be called, in queue order. */
export function waitingQueue(day: Appointment[]) {
  return day.filter(inActiveQueue).filter((x) => x.status !== "In Consultation" && x.status !== "Ready to Join").sort((x, y) => queueKey(x) - queueKey(y));
}

export function queueInfo(appointmentId: string, s: State = state) {
  const a = s.appointments.find((x) => x.id === appointmentId);
  if (!a) return null;
  const day = dayAppointments(a.doctorId, a.date, s);
  const current = day.find((x) => x.status === "In Consultation" || x.status === "Ready to Join");
  const active = waitingQueue(day);
  const ahead = active.filter((x) => queueKey(x) < queueKey(a)).length;
  const lastDone = [...day].reverse().find((x) => x.status === "Completed");
  return {
    queueActive: a.date === todayStr(),
    myNumber: a.queueNumber,
    currentNumber: current?.queueNumber ?? lastDone?.queueNumber ?? 0,
    ahead: current && current.id !== a.id ? ahead + 1 : ahead,
    current,
    next: active,
  };
}

function nextQueueNumber(doctorId: string, date: string, s: State) {
  return s.appointments.filter((a) => a.doctorId === doctorId && a.date === date && !BLOCKING.includes(a.status)).reduce((m, a) => Math.max(m, a.queueNumber), 0) + 1;
}

function patchAppt(id: string, p: Partial<Appointment>) {
  set((s) => ({ ...s, appointments: s.appointments.map((a) => (a.id === id ? { ...a, ...p } : a)) }));
}

/** Minutes until the patient's turn: patients ahead × time per patient, never earlier than the booked time. */
export function minutesUntilTurn(id: string, s: State = state) {
  const a = s.appointments.find((x) => x.id === id);
  const q = queueInfo(id, s);
  if (!a || !q) return null;
  const per = s.availability.find((v) => v.doctorId === a.doctorId)?.consultMinutes ?? 15;
  const byQueue = q.ahead * per;
  const byTime = (slotDateTime(a).getTime() - Date.now()) / 60000;
  return Math.max(0, Math.round(Math.max(byQueue, byTime)));
}
/** Patient shared location: send one 'time to leave' alert when travel time ≥ time left before their turn. */
export function checkLeaveAlert(id: string, pos: { lat: number; lng: number }) {
  const a = state.appointments.find((x) => x.id === id);
  if (!a || a.type !== "clinic" || a.date !== todayStr() || a.leaveAlertAt || !["Confirmed", "Pending"].includes(a.status)) return null;
  const d = state.doctors.find((x) => x.userId === a.doctorId);
  if (d?.clinicLat == null || d.clinicLng == null) return null;
  const km = distanceKm(pos, { lat: d.clinicLat, lng: d.clinicLng });
  const travel = travelMinutes(km);
  const left = minutesUntilTurn(id);
  if (left == null || km < 0.3 || travel < left) return { km, travel, left, sent: false };
  patchAppt(id, { leaveAlertAt: now() });
  notify(a.patientId, "Time to leave for your appointment", `You are about ${km.toFixed(1)} km (~${travel} min) from the clinic and your turn (Queue #${a.queueNumber}) is in about ${left} min. Please leave now.`, `/patient/appointments/${id}`);
  return { km, travel, left, sent: true };
}

function notifyApproaching(doctorId: string, date: string) {
  const day = dayAppointments(doctorId, date);
  const waiting = day.filter(inActiveQueue).filter((x) => x.status !== "In Consultation" && x.status !== "Ready to Join");
  waiting.slice(0, state.settings.turnApproachingAhead + 1).forEach((x, i) => {
    notify(x.patientId, i === 0 ? "You're next" : "Your turn is approaching", `Queue #${x.queueNumber} — ${i} patient(s) ahead of you.`, `/patient/appointments/${x.id}`);
  });
}

// ---------- Auth ----------
export function addReview(input: { appointmentId: string; rating: number; comment: string }) {
  const a = state.appointments.find((x) => x.id === input.appointmentId);
  if (!a || a.status !== "Completed") throw new Error("You can only review completed appointments");
  if (state.reviews.some((r) => r.appointmentId === a.id)) throw new Error("You already reviewed this visit");
  if (input.rating < 1 || input.rating > 5) throw new Error("Choose 1 to 5 stars");
  const r: Review = { id: uid("R"), appointmentId: a.id, doctorId: a.doctorId, patientId: a.patientId, rating: input.rating, comment: input.comment.trim(), at: now() };
  set((s) => ({ ...s, reviews: [r, ...s.reviews] }));
  notify(a.doctorId, "New review", `${input.rating}★ from ${userById(a.patientId)?.name}.`, "/doctor/profile");
  return r;
}
export function doctorRating(doctorId: string, s: State = state) {
  const list = s.reviews.filter((r) => r.doctorId === doctorId);
  return { count: list.length, avg: list.length ? Math.round((list.reduce((t, r) => t + r.rating, 0) / list.length) * 10) / 10 : 0 };
}
export async function requestPasswordReset(email: string) {
  // Never reveal whether the email exists.
  if (!SB) return;
  const { supabase } = await import("./supabase");
  await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
}
export async function setNewPassword(password: string) {
  const { supabase } = await import("./supabase");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

export async function login(email: string, password: string): Promise<User> {
  if (!SB) {
    const u = state.users.find((x) => x.email.toLowerCase() === email.toLowerCase().trim());
    if (!u || u.password !== password) throw new Error("Invalid email or password");
    if (!u.active) throw new Error("This account has been deactivated");
    set((s) => ({ ...s, sessionUserId: u.id }));
    return u;
  }
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.user) throw new Error(error?.message === "Email not confirmed" ? "Please confirm your email first" : "Invalid email or password");
  await hydrate(data.user.id);
  const u = state.users.find((x) => x.id === data.user.id);
  if (!u) { await supabase.auth.signOut(); throw new Error("Account profile not found"); }
  if (!u.active) { await supabase.auth.signOut(); throw new Error("This account has been deactivated"); }
  return u;
}
export async function logout() {
  if (SB) {
    const { supabase } = await import("./supabase");
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  }
  ++hydrationVersion;
  state = SB ? emptyState() : { ...state, sessionUserId: null };
  emit();
}

async function signUp(email: string, password: string, meta: Record<string, unknown>): Promise<string> {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: meta, emailRedirectTo: `${window.location.origin}/login` } });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Sign up failed");
  if (!data.session) throw new Error("Account created — please check your email to confirm, then sign in.");
  await hydrate(data.user.id);
  return data.user.id;
}

export async function registerPatient(input: { name: string; email: string; phone: string; password: string } & Omit<PatientProfile, "userId">): Promise<string> {
  const { name, email, phone, password, ...profile } = input;
  if (SB) return signUp(email, password, { role: "patient", name, phone, profile });
  if (state.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) throw new Error("Email already registered");
  const id = uid("u");
  set((s) => ({
    ...s,
    users: [...s.users, { id, role: "patient", name, email, phone, password, active: true, createdAt: now() }],
    patients: [...s.patients, { userId: id, ...profile }],
    sessionUserId: id,
  }));
  return id;
}

export async function registerDoctor(input: { name: string; email: string; phone: string; password: string; specialization: string; qualification: string; licenseNumber: string; clinicName: string; clinicAddress: string; city: string; online: boolean; clinic: boolean }): Promise<string> {
  const { name, email, phone, password, ...p } = input;
  const fullName = name.startsWith("Dr") ? name : `Dr. ${name}`;
  if (SB) return signUp(email, password, { role: "doctor", name: fullName, phone, profile: p });
  if (state.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) throw new Error("Email already registered");
  const id = uid("u");
  const verification: VerificationStatus = state.settings.doctorVerification ? "Pending Verification" : "Approved";
  set((s) => ({
    ...s,
    users: [...s.users, { id, role: "doctor", name: fullName, email, phone, password, active: true, createdAt: now() }],
    doctors: [...s.doctors, { userId: id, ...p, experience: 0, fee: 0, languages: [], about: "", verification, services: [] }],
    availability: [...s.availability, { doctorId: id, days: [0, 1, 2, 3, 4], start: "09:00", end: "17:00", duration: 30 }],
    sessionUserId: id,
  }));
  state.users.filter((u) => u.role === "admin").forEach((a) => notify(a.id, "New doctor registration", `${name} is awaiting verification.`, "/admin"));
  return id;
}

export async function registerPharmacy(input: { name: string; email: string; phone: string; password: string; storeName: string; address: string; city: string }): Promise<string> {
  const { name, email, phone, password, ...p } = input;
  if (SB) return signUp(email, password, { role: "pharmacy", name, phone, profile: p });
  if (state.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) throw new Error("Email already registered");
  const id = uid("u");
  set((s) => ({ ...s, users: [...s.users, { id, role: "pharmacy", name, email, phone, password, active: true, createdAt: now() }], pharmacies: [...s.pharmacies, { userId: id, phone, ...p }], sessionUserId: id }));
  return id;
}
export function updatePharmacy(id: string, p: Partial<Pharmacy>) {
  set((s) => ({ ...s, pharmacies: s.pharmacies.map((x) => (x.userId === id ? { ...x, ...p } : x)) }));
}
export function saveMedicine(m: Omit<Medicine, "id" | "updatedAt"> & { id?: string }): Medicine {
  if (!m.name.trim()) throw new Error("Medicine name is required");
  if (!(m.price >= 0)) throw new Error("Price must be a number");
  const full: Medicine = { ...m, id: m.id ?? uid("MED"), name: m.name.trim(), updatedAt: now() };
  set((s) => ({ ...s, medicines: m.id ? s.medicines.map((x) => (x.id === m.id ? full : x)) : [full, ...s.medicines] }));
  return full;
}
export function deleteMedicine(id: string) {
  set((s) => ({ ...s, medicines: s.medicines.filter((x) => x.id !== id) }));
}
/** Search in-stock medicines across all pharmacies by name or formula. */
export function searchMedicines(st: { medicines: Medicine[]; pharmacies: Pharmacy[] }, q: string, city = "") {
  const t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  return st.medicines
    .filter((m) => m.inStock && (m.name.toLowerCase().includes(t) || (m.formula ?? "").toLowerCase().includes(t)))
    .map((m) => ({ m, p: st.pharmacies.find((p) => p.userId === m.pharmacyId)! }))
    .filter((x) => x.p && (!city || x.p.city.toLowerCase().includes(city.trim().toLowerCase())))
    .sort((a, b) => a.m.price - b.m.price);
}

// ---------- Profiles ----------
export function updateUser(id: string, p: Partial<User>) {
  set((s) => ({ ...s, users: s.users.map((u) => (u.id === id ? { ...u, ...p } : u)) }));
}
export function updateDoctorProfile(id: string, p: Partial<DoctorProfile>) {
  set((s) => ({ ...s, doctors: s.doctors.map((d) => (d.userId === id ? { ...d, ...p } : d)) }));
}
export function updatePatientProfile(id: string, p: Partial<PatientProfile>) {
  set((s) => ({ ...s, patients: s.patients.map((d) => (d.userId === id ? { ...d, ...p } : d)) }));
}
function validateAvailability(av: Availability) {
  if (av.weeklyShifts) {
    Object.entries(av.weeklyShifts).forEach(([day, shifts]) => {
      if (!/^[0-6]$/.test(day)) throw new Error("Invalid working day");
      validateShifts(shifts);
    });
    Object.entries(av.dateOverrides ?? {}).forEach(([date, shifts]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime())) throw new Error("Invalid schedule date");
      validateShifts(shifts);
    });
    return;
  }
  const capacity = dailyCapacity(av);
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > minutes(av.end) - minutes(av.start)) throw new Error("Daily limit must be a positive whole number within your working minutes");
  if (av.start >= av.end || !av.days.length) throw new Error("Select working days and valid working hours");
}
export function saveAvailability(av: Availability) {
  validateAvailability(av);
  if (av.consultMinutes !== undefined && (!Number.isInteger(av.consultMinutes) || av.consultMinutes < 1 || av.consultMinutes > 240)) throw new Error("Time per patient must be between 1 and 240 minutes");
  if (av.patientsPerSlot !== undefined && (!Number.isInteger(av.patientsPerSlot) || av.patientsPerSlot < 1 || av.patientsPerSlot > 50)) throw new Error("Patients at the same time must be between 1 and 50");
  set((s) => {
    const old = s.availability.find((a) => a.doctorId === av.doctorId);
    const next = { blocked: old?.blocked ?? [], blockedDays: old?.blockedDays ?? [], ...av };
    return { ...s, availability: [...s.availability.filter((a) => a.doctorId !== av.doctorId), next] };
  });
}
/** Await schedule persistence so the editor never reports an unsaved schedule as saved. */
export async function persistAvailability(av: Availability) {
  validateAvailability(av);
  if (av.consultMinutes !== undefined && (!Number.isInteger(av.consultMinutes) || av.consultMinutes < 1 || av.consultMinutes > 240)) throw new Error("Time per patient must be between 1 and 240 minutes");
  if (av.patientsPerSlot !== undefined && (!Number.isInteger(av.patientsPerSlot) || av.patientsPerSlot < 1 || av.patientsPerSlot > 50)) throw new Error("Patients at the same time must be between 1 and 50");
  if (SB) {
    const { supabase } = await import("./supabase");
    const { error } = await supabase.from("availability").upsert({ id: av.doctorId, data: av });
    if (error) throw new Error(error.message);
  }
  const previous = hydrating;
  hydrating = true;
  saveAvailability(av);
  hydrating = previous;
  // Changing time-per-patient re-times upcoming queues in the database; pull the new times.
  if (SB) await hydrate(state.sessionUserId);
}
function patchAvailability(doctorId: string, fn: (a: Availability) => Availability) {
  set((s) => ({ ...s, availability: s.availability.map((a) => (a.doctorId === doctorId ? fn(a) : a)) }));
}
/** Doctor marks a single slot as unavailable (or available again). Booked slots cannot be blocked. */
export function toggleBlockedSlot(doctorId: string, date: string, time: string) {
  const key = `${date} ${time}`;
  const av = state.availability.find((a) => a.doctorId === doctorId);
  const isBlocked = av?.blocked?.includes(key);
  if (!isBlocked && state.appointments.some((a) => a.doctorId === doctorId && a.date === date && a.time === time && !BLOCKING.includes(a.status))) {
    throw new Error("This slot is already booked — cancel or reschedule the appointment first");
  }
  patchAvailability(doctorId, (a) => ({ ...a, blocked: isBlocked ? (a.blocked ?? []).filter((k) => k !== key) : [...(a.blocked ?? []), key] }));
}
/** Doctor marks a whole date as unavailable (leave, holiday) or available again. */
export function toggleBlockedDay(doctorId: string, date: string) {
  patchAvailability(doctorId, (a) => {
    const list = a.blockedDays ?? [];
    return { ...a, blockedDays: list.includes(date) ? list.filter((d) => d !== date) : [...list, date] };
  });
}

// ---------- Files ----------
export function makeDocs(files: FileList | File[], uploadedBy: Role, kind = "Report"): DocFile[] {
  const allowed = state.settings.allowedFileTypes;
  return Array.from(files).map((f) => {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!allowed.includes(ext)) throw new Error(`${f.name}: only ${allowed.join(", ").toUpperCase()} allowed`);
    const id = uid("F");
    if (f.size > 10 * 1024 * 1024) throw new Error(`${f.name}: max 10 MB`);
    pendingFiles.set(id, f);
    return { id, name: f.name, mime: f.type, size: f.size, url: URL.createObjectURL(f), kind, uploadedBy, uploadedAt: now() };
  });
}
export function addAppointmentDocs(id: string, docs: DocFile[]) {
  set((s) => ({ ...s, appointments: s.appointments.map((a) => (a.id === id ? { ...a, documents: [...a.documents, ...docs] } : a)) }));
  const a = state.appointments.find((x) => x.id === id);
  if (a) notify(a.doctorId, "Patient uploaded documents", `${docs.length} file(s) added to ${id}.`, `/doctor/consultation/${id}`);
}

/** Patient call uploads are acknowledged only after storage and metadata are saved. */
export async function persistPatientDocs(id: string, docs: DocFile[]): Promise<Appointment> {
  const a = state.appointments.find((x) => x.id === id);
  if (!a || a.patientId !== state.sessionUserId) throw new Error("Only the appointment's patient can upload documents");
  const updated = { ...a, documents: [...a.documents, ...docs.map((d) => ({ ...d }))] };
  if (SB) {
    await uploadDocs(updated, id, true);
    const table = TABLES.find((t) => t.key === "appointments");
    if (!table) throw new Error("Document saving is unavailable");
    const { supabase } = await import("./supabase");
    const { error } = await supabase.from("appointments").update(table.row(updated)).eq("id", id);
    if (error) throw new Error(error.message);
  }
  state = { ...state, appointments: state.appointments.map((x) => x.id === id ? updated : x) };
  emit();
  notify(a.doctorId, "Patient uploaded documents", `${docs.length} file(s) added to ${id}.`, `/doctor/consultation/${id}`);
  return updated;
}

/** Delete a document. Only the role that uploaded it (patient or doctor) may delete it. */
export function deleteDocument(docId: string) {
  const all = [...state.appointments, ...state.consultations].flatMap((x) => x.documents);
  const d = all.find((x) => x.id === docId);
  if (!d) return;
  const me = state.users.find((u) => u.id === state.sessionUserId);
  if (!me || me.role !== d.uploadedBy) throw new Error("You can only delete documents you uploaded");
  set((s) => ({
    ...s,
    appointments: s.appointments.map((a) => ({ ...a, documents: a.documents.filter((x) => x.id !== docId) })),
    consultations: s.consultations.map((c) => ({ ...c, documents: c.documents.filter((x) => x.id !== docId) })),
  }));
  pendingFiles.delete(docId);
  if (d.path && import.meta.env.MODE !== "test") void import("./supabase").then(({ supabase }) => supabase.storage.from("documents").remove([d.path!]));
}

// ---------- Appointments ----------
export async function bookAppointment(input: { memberId?: string; memberName?: string; doctorId: string; patientId: string; type: ConsultType; date: string; time?: string; reason: string; documents: DocFile[]; followUpOf?: string; payment?: PaymentMethod; rescheduledFrom?: string; patientLat?: number; patientLng?: number }): Promise<Appointment> {
  const previewState = input.rescheduledFrom ? { ...state, appointments: state.appointments.filter((a) => a.id !== input.rescheduledFrom) } : state;
  const slot = nextBooking(input.doctorId, input.date, previewState);
  if (!slot) throw new Error("No places available on this day. Choose another date.");
  const id = "APT-" + crypto.randomUUID();
  let a: Appointment = { ...input, time: slot.time, payment: input.payment ?? "cash", id, status: "Confirmed", queueNumber: nextQueueNumber(input.doctorId, input.date, state), createdAt: now() };
  if (SB) {
    const { supabase } = await import("./supabase");
    const table = TABLES.find((t) => t.key === "appointments");
    if (!table) throw new Error("Booking is unavailable");
    const { data, error } = await supabase.from("appointments").insert(table.row(a)).select("*").single();
    if (error) throw new Error(error.message);
    a = table.from(data) as Appointment;
    a.documents = input.documents;
    await uploadDocs(a, id);
    if (a.documents.some((d) => d.path)) {
      const { error: fileError } = await supabase.from("appointments").update(table.row(a)).eq("id", id);
      if (fileError) void reportSyncError(fileError.message);
    }
  }
  // Server has already saved the booking; publish its committed allocation without a second insert.
  const previousHydrating = hydrating;
  hydrating = true;
  set((s) => ({ ...s, appointments: [...s.appointments.map((old) => old.id === input.rescheduledFrom ? { ...old, status: "Rescheduled" as const, rescheduledTo: id } : old), a] }));
  hydrating = previousHydrating;
  const doc = userById(input.doctorId);
  const pat = userById(input.patientId);
  notify(input.patientId, "Appointment confirmed", `${id} with ${doc?.name} on ${a.date} at ${fmtTime(a.time)} — Queue #${a.queueNumber}.`, `/patient/appointments/${id}`);
  notify(input.doctorId, "New appointment", `${input.memberName ?? pat?.name} booked ${a.date} at ${fmtTime(a.time)} — Queue #${a.queueNumber}.`, `/doctor/appointments`);
  return a;
}

/** Later waiting patients move up one place, taking the previous number and time (mirrors the database). */
function closeQueueGap(a: Appointment) {
  if (SB) return; // the database does this and pushes the new numbers back
  const later = state.appointments.filter((x) => x.doctorId === a.doctorId && x.date === a.date && x.id !== a.id && ["Confirmed", "Pending", "Waiting", "Checked-In"].includes(x.status) && x.queueNumber > a.queueNumber).sort((x, y) => x.queueNumber - y.queueNumber);
  let q = a.queueNumber, t = a.time;
  const moves = new Map<string, { queueNumber: number; time: string }>();
  for (const x of later) { moves.set(x.id, { queueNumber: q, time: t }); q = x.queueNumber; t = x.time; }
  set((s) => ({ ...s, appointments: s.appointments.map((x) => (moves.has(x.id) ? { ...x, ...moves.get(x.id)! } : x)) }));
}

export function cancelAppointment(id: string, by: Role, reason = "") {
  const a = state.appointments.find((x) => x.id === id);
  if (!a) return;
  const wasActive = !FINISHED.includes(a.status);
  patchAppt(id, { status: "Cancelled", cancelledBy: by, cancelReason: reason });
  if (wasActive) closeQueueGap(a);
  const msg = `${id} on ${a.date} at ${fmtTime(a.time)} was cancelled by ${by}.${reason ? " Reason: " + reason : ""}`;
  if (by !== "patient") notify(a.patientId, "Appointment cancelled", msg, `/patient/appointments/${id}`);
  if (by !== "doctor") notify(a.doctorId, "Appointment cancelled", msg, `/doctor/appointments`);
}

export async function rescheduleAppointment(id: string, date: string): Promise<Appointment> {
  const old = state.appointments.find((x) => x.id === id);
  if (!old) throw new Error("Appointment not found");
  const fresh = await bookAppointment({ doctorId: old.doctorId, patientId: old.patientId, memberId: old.memberId, memberName: old.memberName, type: old.type, date, reason: old.reason, documents: old.documents, followUpOf: old.followUpOf, payment: old.payment, rescheduledFrom: id });
  const msg = `${id} moved to ${date} at ${fmtTime(fresh.time)} (Queue #${fresh.queueNumber}).`;
  notify(old.patientId, "Appointment rescheduled", msg, `/patient/appointments/${fresh.id}`);
  notify(old.doctorId, "Appointment rescheduled", msg, `/doctor/appointments`);
  return fresh;
}

/** Clinic check-in by appointment ID or phone number (today). */
export function checkIn(method: "appointmentId" | "phone", value: string): Appointment {
  if (!state.settings.checkInMethods[method]) throw new Error("This check-in method is disabled");
  const t = todayStr();
  let a: Appointment | undefined;
  if (method === "appointmentId") a = state.appointments.find((x) => x.id.toUpperCase() === value.trim().toUpperCase());
  else {
    const u = state.users.find((x) => x.phone.replace(/\s/g, "") === value.replace(/\s/g, ""));
    a = u && state.appointments.filter((x) => x.patientId === u.id && x.date === t && x.type === "clinic" && x.status === "Confirmed").sort((x, y) => x.time.localeCompare(y.time))[0];
  }
  if (!a) throw new Error("No matching appointment found");
  if (a.type !== "clinic") throw new Error("Online appointments don't require check-in");
  if (a.date !== t) throw new Error("Check-in is only available on the appointment day");
  if (a.status !== "Confirmed") throw new Error(`Cannot check in — status is ${a.status}`);
  patchAppt(a.id, { status: "Checked-In", checkedInAt: now() });
  const q = queueInfo(a.id)!;
  notify(a.patientId, "Checked in", `You're #${a.queueNumber} in the queue. ${q.ahead} patient(s) ahead.`, `/patient/appointments/${a.id}`);
  return state.appointments.find((x) => x.id === a!.id)!;
}

/** Clinic kiosk check-in; works without signing in (server function). */
export async function kioskCheckIn(method: "appointmentId" | "phone", value: string): Promise<{ id: string; appointment?: Appointment }> {
  if (!SB) { const a = checkIn(method, value); return { id: a.id, appointment: a }; }
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("kiosk_check_in", { method, value });
  if (error) throw new Error(error.message);
  const id = data as string;
  await hydrate(state.sessionUserId);
  return { id, appointment: state.appointments.find((x) => x.id === id) };
}

export function markWaiting(id: string) {
  patchAppt(id, { status: "Waiting" });
}

/** Doctor calls the next patient (clinic → In Consultation; online → Ready to Join). */
export function callPatient(id: string) {
  const a = state.appointments.find((x) => x.id === id);
  if (!a) return;
  if (a.type === "clinic") {
    patchAppt(id, { status: "In Consultation" });
    notify(a.patientId, "It's your turn", `Please proceed to ${userById(a.doctorId)?.name}'s room.`, `/patient/appointments/${id}`);
  } else {
    patchAppt(id, { status: "Ready to Join" });
    notify(a.patientId, "Doctor is ready", `${userById(a.doctorId)?.name} is ready. Join your video consultation now.`, `/patient/consultation/${id}`);
  }
  ensureConsultation(id);
  notifyApproaching(a.doctorId, a.date);
}

export function joinOnline(id: string) {
  const a = state.appointments.find((x) => x.id === id);
  if (a && (a.status === "Ready to Join" || a.status === "Confirmed" || a.status === "Waiting")) patchAppt(id, { status: "In Consultation" });
  ensureConsultation(id);
}

export function markNoShow(id: string) {
  const a = state.appointments.find((x) => x.id === id);
  const wasActive = !!a && !FINISHED.includes(a.status);
  patchAppt(id, { status: "No Show" });
  if (a && wasActive) closeQueueGap(a);
  if (a) {
    notify(a.patientId, "Marked as no-show", `You missed ${id}. You can book a new appointment anytime.`, `/patient/appointments/${id}`);
    notifyApproaching(a.doctorId, a.date);
  }
}

function keyAt(list: Appointment[], position: number) {
  if (list.length === 0) return 1;
  const pos = Math.max(0, Math.min(position, list.length));
  if (pos === 0) return queueKey(list[0]) - 1;
  if (pos === list.length) return queueKey(list[list.length - 1]) + 1;
  return (queueKey(list[pos - 1]) + queueKey(list[pos])) / 2;
}

/** A returning patient gets a fresh number; the active queue is renumbered in order (mirrors the database). */
function renumberAfterReturn(doctorId: string, date: string, returnedId: string) {
  const day = state.appointments.filter((x) => x.doctorId === doctorId && x.date === date);
  const active = day.filter((x) => ["Confirmed", "Pending", "Waiting", "Checked-In"].includes(x.status)).sort((x, y) => queueKey(x) - queueKey(y));
  const returned = active.find((x) => x.id === returnedId)!;
  const others = active.filter((x) => x !== returned);
  const nums = [...others.map((x) => x.queueNumber).sort((p, q) => p - q), Math.max(0, ...day.map((x) => x.queueNumber)) + 1];
  const times = others.map((x) => x.time).sort();
  const step = state.availability.find((v) => v.doctorId === doctorId)?.consultMinutes ?? 15;
  const last = times[times.length - 1];
  if (last) { const m = Number(last.slice(0, 2)) * 60 + Number(last.slice(3, 5)) + step; times.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`); } else times.push(returned.time);
  const next = new Map(active.map((x, i) => [x.id, { queueNumber: nums[i], time: times[i], queueOrder: undefined }]));
  set((s) => ({ ...s, appointments: s.appointments.map((x) => (next.has(x.id) ? { ...x, ...next.get(x.id)! } : x)) }));
}

/** Bring an absent (no-show) patient back into today's queue; position = patients ahead of them (0 = next). */
export function returnToQueue(id: string, position: number) {
  const a = state.appointments.find((x) => x.id === id);
  if (!a || a.status !== "No Show") return;
  const list = waitingQueue(dayAppointments(a.doctorId, a.date)).filter((x) => x.id !== id);
  patchAppt(id, { status: "Waiting", queueOrder: keyAt(list, position) });
  if (!SB) renumberAfterReturn(a.doctorId, a.date, id);
  const ahead = Math.max(0, Math.min(position, list.length));
  notify(a.patientId, "You're back in the queue", ahead === 0 ? "You are next in line." : `${ahead} patient${ahead > 1 ? "s" : ""} ahead of you.`, `/patient/appointments/${id}`);
}

/** Move a waiting patient up (-1) or down (+1) in the queue. */
export function moveInQueue(id: string, dir: -1 | 1) {
  const a = state.appointments.find((x) => x.id === id);
  if (!a) return;
  const list = waitingQueue(dayAppointments(a.doctorId, a.date));
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  const rest = list.filter((x) => x.id !== id);
  patchAppt(id, { queueOrder: keyAt(rest, j) });
}

export function canJoin(a: Appointment) {
  if (a.type !== "online") return false;
  if (a.status === "Ready to Join" || a.status === "In Consultation") return true;
  if (!["Confirmed", "Waiting"].includes(a.status)) return false;
  const diff = (slotDateTime(a).getTime() - Date.now()) / 60000;
  return diff <= state.settings.joinWindowMinutes && diff > -60;
}

// ---------- Consultations ----------
/** Save doctor attachments immediately, including for completed consultations. */
export async function addConsultationDocs(appointmentId: string, docs: DocFile[]): Promise<Consultation> {
  const a = state.appointments.find((x) => x.id === appointmentId);
  const doctor = userById(state.sessionUserId ?? "");
  if (!a || doctor?.role !== "doctor" || a.doctorId !== doctor.id) throw new Error("Only the appointment's doctor can upload documents");
  if (docs.some((d) => d.uploadedBy !== "doctor")) throw new Error("Doctor documents must be uploaded as doctor");
  const existing = state.consultations.find((c) => c.appointmentId === appointmentId);
  const record: Consultation = existing ?? { appointmentId, doctorId: a.doctorId, patientId: a.patientId, symptoms: a.reason, diagnosis: "", privateNotes: "", summary: "", prescription: [], documents: [], followUpRequired: false, followUpTiming: "" };
  const updated = { ...record, documents: [...record.documents, ...docs.map((d) => ({ ...d }))] };
  if (SB) {
    await uploadDocs(updated, appointmentId, true);
    const table = TABLES.find((t) => t.key === "consultations");
    if (!table) throw new Error("Document saving is unavailable");
    const { supabase } = await import("./supabase");
    const { error } = await supabase.from("consultations").upsert(table.row(updated));
    if (error) throw new Error(error.message);
  }
  state = { ...state, consultations: [...state.consultations.filter((c) => c.appointmentId !== appointmentId), updated] };
  emit();
  return updated;
}

export function ensureConsultation(appointmentId: string): Consultation {
  const ex = state.consultations.find((c) => c.appointmentId === appointmentId);
  if (ex) return ex;
  const a = state.appointments.find((x) => x.id === appointmentId)!;
  const c: Consultation = { appointmentId, doctorId: a.doctorId, patientId: a.patientId, symptoms: a.reason, diagnosis: "", privateNotes: "", summary: "", prescription: [], documents: [], followUpRequired: false, followUpTiming: "" };
  set((s) => ({ ...s, consultations: [...s.consultations, c] }));
  return c;
}
export function saveConsultation(appointmentId: string, p: Partial<Consultation>) {
  ensureConsultation(appointmentId);
  set((s) => ({ ...s, consultations: s.consultations.map((c) => (c.appointmentId === appointmentId ? { ...c, ...p } : c)) }));
}
export function completeConsultation(appointmentId: string, p: Partial<Consultation>) {
  saveConsultation(appointmentId, { ...p, completedAt: now() });
  const a = state.appointments.find((x) => x.id === appointmentId)!;
  patchAppt(appointmentId, { status: "Completed" });
  const c = state.consultations.find((x) => x.appointmentId === appointmentId)!;
  notify(a.patientId, "Consultation completed", `Your record from ${userById(a.doctorId)?.name} is ready in Health Records.`, `/patient/records`);
  if (c.followUpRequired) notify(a.patientId, "Follow-up recommended", `${userById(a.doctorId)?.name}: ${c.followUpTiming}. Book from Health Records.`, `/patient/book/${a.doctorId}?followUpOf=${a.id}`);
  notifyApproaching(a.doctorId, a.date);
}

// ---------- Notifications ----------
export function markAllRead(userId: string) {
  set((s) => ({ ...s, notifications: s.notifications.map((n) => (n.userId === userId ? { ...n, read: true } : n)) }));
}
/** Simulates scheduled reminders for upcoming appointments (24h & shortly before). */
export function runReminders(userId: string) {
  const mine = state.appointments.filter((a) => a.patientId === userId && ["Confirmed", "Waiting"].includes(a.status));
  mine.forEach((a) => {
    const mins = (slotDateTime(a).getTime() - Date.now()) / 60000;
    const key = (k: string) => state.notifications.some((n) => n.userId === userId && n.title === k && n.body.includes(a.id));
    if (mins > 0 && mins <= 24 * 60 && !key("Appointment reminder")) notify(userId, "Appointment reminder", `${a.id} with ${userById(a.doctorId)?.name} on ${a.date} at ${fmtTime(a.time)}.`, `/patient/appointments/${a.id}`);
    if (mins > 0 && mins <= 60 && !key("Starting soon")) notify(userId, "Starting soon", `${a.id} begins at ${fmtTime(a.time)}. ${a.type === "online" ? "Join from your dashboard." : "Please arrive and check in."}`, `/patient/appointments/${a.id}`);
  });
}

// ---------- Admin ----------
export function setVerification(doctorId: string, v: VerificationStatus) {
  updateDoctorProfile(doctorId, { verification: v });
  notify(doctorId, `Verification ${v === "Approved" ? "approved" : v === "Rejected" ? "rejected" : "pending"}`, v === "Approved" ? "Your profile is now visible to patients." : v === "Rejected" ? "Your registration was rejected. Contact support." : "Your account is under review.", "/doctor");
}
export function updateSettings(p: Partial<Settings>) {
  set((s) => ({ ...s, settings: { ...s.settings, ...p } }));
}


// ---------- Family / linked accounts ----------
const MEMBER_KEY = "sahoolat-active-member";
let activeMember: string | null = null;
const memberSubs = new Set<() => void>();
function readMember(userId: string | null) {
  if (typeof window === "undefined" || !userId) return null;
  try { return (JSON.parse(localStorage.getItem(MEMBER_KEY) || "{}") as Record<string, string | null>)[userId] ?? null; } catch { return null; }
}
/** Switch which profile (main = null, or a member id) the patient area shows. */
export function setActiveMember(memberId: string | null) {
  activeMember = memberId;
  const uid0 = state.sessionUserId;
  if (typeof window !== "undefined" && uid0) {
    try { const m = JSON.parse(localStorage.getItem(MEMBER_KEY) || "{}"); m[uid0] = memberId; localStorage.setItem(MEMBER_KEY, JSON.stringify(m)); } catch { /* ignore */ }
  }
  memberSubs.forEach((f) => f());
}
export function useActiveMember(): string | null {
  const userId = useStore((s) => s.sessionUserId);
  const members = useStore((s) => s.patients.find((p) => p.userId === s.sessionUserId)?.members);
  const [, force] = useState(0);
  useEffect(() => { activeMember = readMember(userId); force((n) => n + 1); const f = () => force((n) => n + 1); memberSubs.add(f); return () => { memberSubs.delete(f); }; }, [userId]);
  return activeMember && members?.some((m) => m.id === activeMember) ? activeMember : null;
}
export const memberOf = (a: { memberId?: string } | undefined) => a?.memberId ?? null;
/** Display name of the person the appointment is for. */
export const patientLabel = (a: Appointment) => a.memberName ?? state.users.find((u) => u.id === a.patientId)?.name ?? "";
export function addFamilyMember(userId: string, m: Omit<FamilyMember, "id">): FamilyMember {
  const member: FamilyMember = { ...m, name: m.name.trim(), id: uid("M") };
  if (!member.name) throw new Error("Name is required");
  set((s) => ({ ...s, patients: s.patients.map((p) => (p.userId === userId ? { ...p, members: [...(p.members ?? []), member] } : p)) }));
  return member;
}
export function updateFamilyMember(userId: string, id: string, patch: Partial<FamilyMember>) {
  set((s) => ({ ...s, patients: s.patients.map((p) => (p.userId === userId ? { ...p, members: (p.members ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)) } : p)) }));
}
export function removeFamilyMember(userId: string, id: string) {
  if (state.appointments.some((a) => a.patientId === userId && a.memberId === id)) throw new Error("This person has appointments and cannot be removed");
  set((s) => ({ ...s, patients: s.patients.map((p) => (p.userId === userId ? { ...p, members: (p.members ?? []).filter((m) => m.id !== id) } : p)) }));
  if (activeMember === id) setActiveMember(null);
}
/** Find a member by name (case-insensitive) or create one — used when booking for someone else. */
export function ensureFamilyMember(userId: string, name: string, relation = "Other"): FamilyMember {
  const p = state.patients.find((x) => x.userId === userId);
  const hit = p?.members?.find((m) => m.name.trim().toLowerCase() === name.trim().toLowerCase());
  return hit ?? addFamilyMember(userId, { name, relation });
}

/** Pick files and read each one with AI to fill in report name, date and type. Falls back silently. */
export async function readAndMakeDocs(files: FileList | File[], uploadedBy: Role, requireTitle = false): Promise<DocFile[]> {
  const list = Array.from(files);
  const docs = makeDocs(list, uploadedBy);
  if (import.meta.env.MODE === "test" && !requireTitle) return docs;
  return Promise.all(docs.map(async (d, i) => {
    try {
      const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(list[i]); });
      const info = await readReport({ data: { dataUrl, fileName: d.name } });
      if (requireTitle && !info?.title.trim()) throw new Error("Could not read the report heading. Please upload a clearer image or PDF and try again.");
      const ext = d.name.includes(".") ? d.name.slice(d.name.lastIndexOf(".")) : "";
      const nm = info?.title ? `${info.title.replace(/[\\/:*?"<>|]/g, "-")}${info.reportDate ? " " + info.reportDate : ""}${ext}` : d.name;
      return info ? { ...d, name: nm, title: info.title || undefined, reportDate: info.reportDate || undefined, kind: info.kind || d.kind } : d;
    } catch (error) { if (requireTitle) throw error; return d; }
  }));
}

// ---------- Call recordings (admin case files) ----------
export type CallRecording = { id: string; appointmentId: string; uploaderId: string; role: string; url: string; startedAt: string };

/** Uploads one audio segment of a video consultation. Readable only by admins. */
export async function uploadCallRecording(appointmentId: string, blob: Blob, startedAt: string) {
  if (!SB || !blob.size) return;
  const { supabase } = await import("./supabase");
  const uid = state.sessionUserId;
  if (!uid) return;
  const role = state.users.find((u) => u.id === uid)?.role ?? "patient";
  const ext = blob.type.includes("mp4") ? "m4a" : "webm";
  const path = `${uid}/${appointmentId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("recordings").upload(path, blob, { contentType: blob.type || "audio/webm" });
  if (error) throw error;
  await supabase.from("call_recordings").insert({ appointment_id: appointmentId, uploader_id: uid, role, path, started_at: startedAt });
}

export async function listCallRecordings(appointmentId: string): Promise<CallRecording[]> {
  if (!SB) return [];
  const { supabase } = await import("./supabase");
  const { data } = await supabase.from("call_recordings").select("*").eq("appointment_id", appointmentId).order("started_at");
  const out: CallRecording[] = [];
  for (const r of data ?? []) {
    const { data: s } = await supabase.storage.from("recordings").createSignedUrl(r.path, 3600);
    out.push({ id: r.id, appointmentId: r.appointment_id, uploaderId: r.uploader_id, role: r.role, url: s?.signedUrl ?? "", startedAt: r.started_at });
  }
  return out;
}

export async function recordedAppointmentIds(): Promise<Set<string>> {
  if (!SB) return new Set();
  const { supabase } = await import("./supabase");
  const { data } = await supabase.from("call_recordings").select("appointment_id");
  return new Set((data ?? []).map((r: { appointment_id: string }) => r.appointment_id));
}
