/**
 * Mock data layer (in-memory). Every exported function mirrors a future
 * backend call so it can be swapped for self-hosted Supabase later.
 */
import { useCallback, useRef, useSyncExternalStore } from "react";
import { addDays, addMinutes, format, parse } from "date-fns";

export type Role = "patient" | "doctor" | "admin";
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
}

export interface Availability {
  doctorId: string;
  days: number[]; // 0=Sun..6=Sat
  start: string; // HH:mm
  end: string;
  duration: number; // minutes
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
    sessionUserId: null,
  };
}

// ---------- Store plumbing ----------
let state: State = seed();
const listeners = new Set<() => void>();
function set(fn: (s: State) => State) {
  state = fn(state);
  listeners.forEach((l) => l());
}
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

/** Auto-generated slots for a doctor on a date, booked ones excluded. */
export function getSlots(doctorId: string, date: string, s: State = state): { time: string; available: boolean; blocked?: boolean; booked?: boolean }[] {
  const av = s.availability.find((a) => a.doctorId === doctorId);
  if (!av) return [];
  const day = parse(date, "yyyy-MM-dd", new Date());
  if (!av.days.includes(day.getDay())) return [];
  const dayOff = av.blockedDays?.includes(date) ?? false;
  const out: { time: string; available: boolean; blocked?: boolean; booked?: boolean }[] = [];
  let cur = parse(`${date} ${av.start}`, "yyyy-MM-dd HH:mm", new Date());
  const end = parse(`${date} ${av.end}`, "yyyy-MM-dd HH:mm", new Date());
  const taken = new Set(s.appointments.filter((a) => a.doctorId === doctorId && a.date === date && !BLOCKING.includes(a.status)).map((a) => a.time));
  const nowD = new Date();
  while (addMinutes(cur, av.duration) <= end) {
    const time = format(cur, "HH:mm");
    const blocked = dayOff || (av.blocked?.includes(`${date} ${time}`) ?? false);
    const booked = taken.has(time);
    out.push({ time, available: !booked && !blocked && cur > nowD, blocked, booked });
    cur = addMinutes(cur, av.duration);
  }
  return out;
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

export function queueInfo(appointmentId: string, s: State = state) {
  const a = s.appointments.find((x) => x.id === appointmentId);
  if (!a) return null;
  const day = dayAppointments(a.doctorId, a.date, s);
  const current = day.find((x) => x.status === "In Consultation" || x.status === "Ready to Join");
  const active = day.filter(inActiveQueue).filter((x) => x.status !== "In Consultation" && x.status !== "Ready to Join");
  const ahead = active.filter((x) => x.queueNumber < a.queueNumber).length;
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
  return s.appointments.filter((a) => a.doctorId === doctorId && a.date === date).reduce((m, a) => Math.max(m, a.queueNumber), 0) + 1;
}

function patchAppt(id: string, p: Partial<Appointment>) {
  set((s) => ({ ...s, appointments: s.appointments.map((a) => (a.id === id ? { ...a, ...p } : a)) }));
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
export function requestPasswordReset(email: string) {
  // Mock: real email is sent by the backend later. Never reveal whether the email exists.
  void email;
}

export function login(email: string, password: string): User {
  const u = state.users.find((x) => x.email.toLowerCase() === email.toLowerCase().trim());
  if (!u || u.password !== password) throw new Error("Invalid email or password");
  if (!u.active) throw new Error("This account has been deactivated");
  set((s) => ({ ...s, sessionUserId: u.id }));
  return u;
}
export function logout() {
  set((s) => ({ ...s, sessionUserId: null }));
}

export function registerPatient(input: { name: string; email: string; phone: string; password: string } & Omit<PatientProfile, "userId">) {
  if (state.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) throw new Error("Email already registered");
  const id = uid("u");
  const { name, email, phone, password, ...profile } = input;
  set((s) => ({
    ...s,
    users: [...s.users, { id, role: "patient", name, email, phone, password, active: true, createdAt: now() }],
    patients: [...s.patients, { userId: id, ...profile }],
    sessionUserId: id,
  }));
  return id;
}

export function registerDoctor(input: { name: string; email: string; phone: string; password: string; specialization: string; qualification: string; licenseNumber: string; clinicName: string; clinicAddress: string; city: string; online: boolean; clinic: boolean }) {
  if (state.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) throw new Error("Email already registered");
  const id = uid("u");
  const { name, email, phone, password, ...p } = input;
  const verification: VerificationStatus = state.settings.doctorVerification ? "Pending Verification" : "Approved";
  set((s) => ({
    ...s,
    users: [...s.users, { id, role: "doctor", name: name.startsWith("Dr") ? name : `Dr. ${name}`, email, phone, password, active: true, createdAt: now() }],
    doctors: [...s.doctors, { userId: id, ...p, experience: 0, fee: 0, languages: [], about: "", verification, services: [] }],
    availability: [...s.availability, { doctorId: id, days: [0, 1, 2, 3, 4], start: "09:00", end: "17:00", duration: 30 }],
    sessionUserId: id,
  }));
  state.users.filter((u) => u.role === "admin").forEach((a) => notify(a.id, "New doctor registration", `${name} is awaiting verification.`, "/admin"));
  return id;
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
export function saveAvailability(av: Availability) {
  set((s) => {
    const old = s.availability.find((a) => a.doctorId === av.doctorId);
    const next = { blocked: old?.blocked ?? [], blockedDays: old?.blockedDays ?? [], ...av };
    return { ...s, availability: [...s.availability.filter((a) => a.doctorId !== av.doctorId), next] };
  });
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
    return { id: uid("F"), name: f.name, mime: f.type, size: f.size, url: URL.createObjectURL(f), kind, uploadedBy, uploadedAt: now() };
  });
}
export function addAppointmentDocs(id: string, docs: DocFile[]) {
  set((s) => ({ ...s, appointments: s.appointments.map((a) => (a.id === id ? { ...a, documents: [...a.documents, ...docs] } : a)) }));
  const a = state.appointments.find((x) => x.id === id);
  if (a) notify(a.doctorId, "Patient uploaded documents", `${docs.length} file(s) added to ${id}.`, `/doctor/consultation/${id}`);
}

// ---------- Appointments ----------
export function bookAppointment(input: { doctorId: string; patientId: string; type: ConsultType; date: string; time: string; reason: string; documents: DocFile[]; followUpOf?: string; payment?: PaymentMethod }): Appointment {
  const slot = getSlots(input.doctorId, input.date).find((x) => x.time === input.time);
  if (!slot?.available) throw new Error("This slot is no longer available");
  const id = "APT-" + Math.floor(2000 + Math.random() * 8000);
  const a: Appointment = { ...input, payment: input.payment ?? "cash", id, status: "Confirmed", queueNumber: nextQueueNumber(input.doctorId, input.date, state), createdAt: now() };
  // keep queue numbers in time order for the day
  set((s) => {
    const list = [...s.appointments, a];
    const day = list.filter((x) => x.doctorId === a.doctorId && x.date === a.date).sort((x, y) => x.time.localeCompare(y.time));
    const order = new Map(day.map((x, i) => [x.id, i + 1]));
    return { ...s, appointments: list.map((x) => (order.has(x.id) ? { ...x, queueNumber: order.get(x.id)! } : x)) };
  });
  const doc = userById(input.doctorId);
  const pat = userById(input.patientId);
  notify(input.patientId, "Appointment confirmed", `${id} with ${doc?.name} on ${input.date} at ${input.time} (${input.type === "online" ? "Online" : "In-Clinic"}).`, `/patient/appointments/${id}`);
  notify(input.doctorId, "New appointment", `${pat?.name} booked ${input.date} at ${input.time}.`, `/doctor/appointments`);
  return state.appointments.find((x) => x.id === id)!;
}

export function cancelAppointment(id: string, by: Role, reason = "") {
  const a = state.appointments.find((x) => x.id === id);
  if (!a) return;
  patchAppt(id, { status: "Cancelled", cancelledBy: by, cancelReason: reason });
  const msg = `${id} on ${a.date} at ${a.time} was cancelled by ${by}.${reason ? " Reason: " + reason : ""}`;
  if (by !== "patient") notify(a.patientId, "Appointment cancelled", msg, `/patient/appointments/${id}`);
  if (by !== "doctor") notify(a.doctorId, "Appointment cancelled", msg, `/doctor/appointments`);
}

export function rescheduleAppointment(id: string, date: string, time: string): Appointment {
  const old = state.appointments.find((x) => x.id === id);
  if (!old) throw new Error("Appointment not found");
  const fresh = bookAppointment({ doctorId: old.doctorId, patientId: old.patientId, type: old.type, date, time, reason: old.reason, documents: old.documents, followUpOf: old.followUpOf });
  patchAppt(id, { status: "Rescheduled", rescheduledTo: fresh.id });
  patchAppt(fresh.id, { rescheduledFrom: id });
  const msg = `${id} moved to ${date} at ${time} (new ID ${fresh.id}).`;
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
  patchAppt(id, { status: "No Show" });
  if (a) {
    notify(a.patientId, "Marked as no-show", `You missed ${id}. You can book a new appointment anytime.`, `/patient/appointments/${id}`);
    notifyApproaching(a.doctorId, a.date);
  }
}

export function canJoin(a: Appointment) {
  if (a.type !== "online") return false;
  if (a.status === "Ready to Join" || a.status === "In Consultation") return true;
  if (!["Confirmed", "Waiting"].includes(a.status)) return false;
  const diff = (slotDateTime(a).getTime() - Date.now()) / 60000;
  return diff <= state.settings.joinWindowMinutes && diff > -60;
}

// ---------- Consultations ----------
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
    if (mins > 0 && mins <= 24 * 60 && !key("Appointment reminder")) notify(userId, "Appointment reminder", `${a.id} with ${userById(a.doctorId)?.name} on ${a.date} at ${a.time}.`, `/patient/appointments/${a.id}`);
    if (mins > 0 && mins <= 60 && !key("Starting soon")) notify(userId, "Starting soon", `${a.id} begins at ${a.time}. ${a.type === "online" ? "Join from your dashboard." : "Please arrive and check in."}`, `/patient/appointments/${a.id}`);
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
