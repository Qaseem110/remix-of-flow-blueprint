import { sameClinic, clinicKey } from "./clinic";
import { appointmentStatus, clinicDate } from "./appointment-lifecycle";
import { labTestCatalogue, testsNeedingPrescription, validateLabTests, type LabTest } from "./lab-tests";
import { labSlots, validateLabSchedule, type LabSchedule } from "./lab-schedule";
import { dueDoses } from "./medicine-reminders";
import { clinicMinutesNow } from "./no-show-grace";
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

export type Role = "patient" | "doctor" | "admin" | "pharmacy" | "receptionist" | "lab";
export type ReceptionPermissions = { book: boolean; queue: boolean; checkIn: boolean; cancel: boolean };
export interface Receptionist { id: string; doctorId: string; name: string; email: string; phone: string; permissions: ReceptionPermissions }

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
export interface Lab {
  userId: string;
  labName: string;
  phone: string;
  address: string;
  city: string;
  tests?: string; // tests offered, free text
  testCatalogue?: LabTest[];
  hours?: string;
  schedule?: LabSchedule;
}
export type LabOrderStatus = "Requested" | "Sample collected" | "Completed" | "Cancelled" | "Expired";
export interface VolunteerSession {
  id: string;
  doctorId: string;
  date: string; // yyyy-MM-dd (clinic date)
  start: string; // HH:mm
  end: string;
  mode: "clinic" | "online";
  location?: string; // address for in-clinic sessions
  city?: string;
  capacity: number;
  focus?: string; // e.g. "Children", "Diabetes screening"
  notes?: string;
  status: "Open" | "Cancelled";
  booked?: number; // maintained by the database
  createdAt: string;
}
export interface VolunteerBooking {
  id: string;
  sessionId: string;
  patientId: string;
  memberName?: string;
  reason: string;
  token?: number;
  status: "Booked" | "In Consultation" | "Attended" | "Missed" | "Cancelled";
  createdAt: string;
}
export interface LabOrder {
  id: string;
  trackingNumber?: string;
  token?: number; // per-lab, per-day token
  labId: string;
  patientId: string;
  doctorId: string;
  appointmentId: string; // the doctor appointment whose prescription authorises the test
  memberName?: string;
  tests: string;
  date: string; // yyyy-MM-dd
  time?: string; // legacy orders remain untimed until scheduled by the lab
  slotMinutes?: number;
  notes?: string;
  orderedBy: "doctor" | "patient";
  status: LabOrderStatus;
  documents: DocFile[];
  createdAt: string;
  completedAt?: string;
  sampleStage?: string;
  reviewedBy?: string;
  criticalNote?: string;
  criticalAcknowledgedAt?: string;
}
export interface LabMessage {
  id: string;
  orderId: string;
  authorId: string;
  body: string;
  at: string;
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
  quantity?: number;
  lowStock?: number;
  expiry?: string;
  prescriptionRequired?: boolean;
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
  | "Rescheduled"
  | "Expired";

export const ALL_STATUSES: AppointmentStatus[] = [
  "Pending", "Confirmed", "Checked-In", "Waiting", "Ready to Join",
  "In Consultation", "Completed", "Cancelled", "No Show", "Rescheduled", "Expired",
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

export interface DoctorAlertSettings { enabled: boolean; dailyTime: string; phone: string; discussionAlerts: boolean }
export async function getDoctorAlertSettings(): Promise<DoctorAlertSettings> {
  if (!SB) return { enabled: false, dailyTime: "08:00", phone: "", discussionAlerts: true };
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.from("doctor_alert_settings").select("enabled,daily_time,phone,discussion_alerts").eq("doctor_id", state.sessionUserId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { enabled: data.enabled, dailyTime: data.daily_time, phone: data.phone, discussionAlerts: data.discussion_alerts } : { enabled: false, dailyTime: "08:00", phone: "", discussionAlerts: true };
}
export async function saveDoctorAlertSettings(settings: DoctorAlertSettings) {
  if (!state.doctors.some((d) => d.userId === state.sessionUserId)) throw new Error("Only doctors can save stats settings");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.dailyTime)) throw new Error("Choose a valid daily time");
  if ((settings.enabled || settings.discussionAlerts) && !/^\+?[1-9]\d{9,14}$/.test(settings.phone)) throw new Error("Enter WhatsApp number with country code");
  if (!SB) return;
  const { supabase } = await import("./supabase");
  const { error } = await supabase.from("doctor_alert_settings").upsert({ doctor_id: state.sessionUserId, enabled: settings.enabled, daily_time: settings.dailyTime, phone: settings.phone, discussion_alerts: settings.discussionAlerts });
  if (error) throw new Error(error.message);
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
  clinicId?: string;
  clinics?: Record<string, Availability>;
  days: number[]; // 0=Sun..6=Sat
  start: string; // HH:mm
  end: string;
  duration: number; // minutes
  dailyLimit?: number; // appointments shared across online and clinic visits
  consultMinutes?: number; // minutes the doctor spends per patient
  patientsPerSlot?: number; // patients seen together at the same time
  breakStartedAt?: string; // set while the doctor has paused the queue
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
  version?: number;
  correctionOf?: string;
  reportDate?: string; // date printed on the report (yyyy-MM-dd)
}

export interface Appointment {
  id: string;
  clinicId?: string;
  clinicName?: string;
  clinicAddress?: string;
  clinicLat?: number;
  clinicLng?: number;
  trackingNumber?: string;
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
  leaveAlertAt?: string;
  walkIn?: { name: string; phone: string; age?: number; gender?: string }; // booked by reception for someone without an account
  bookedBy?: string; // when the 'time to leave' alert was sent
}

export interface PrescriptionItem {
  medicine: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  times?: string[]; // daily reminder times "HH:mm" for the patient
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
  labTests?: string; // tests the doctor recommends
  documents: DocFile[];
  followUpRequired: boolean;
  followUpTiming: string;
  followUpDate?: string;
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
  /** Detailed tap-only answers (1-5 per aspect). Optional for older reviews. */
  aspects?: Partial<Record<ReviewAspect, number>>;
  waitTime?: ReviewWait;
  recommend?: boolean;
  tags?: string[];
}
export const REVIEW_ASPECTS = ["Listening", "Explanation", "Diagnosis", "Behaviour", "Clinic / call quality", "Value for money"] as const;
export type ReviewAspect = typeof REVIEW_ASPECTS[number];
export const REVIEW_WAITS = ["On time", "Under 15 min", "15–30 min", "30–60 min", "Over 1 hour"] as const;
export type ReviewWait = typeof REVIEW_WAITS[number];
export const REVIEW_TAGS = ["Gave enough time", "Clear prescription", "Polite staff", "Clean clinic", "Explained tests", "Felt better", "Would visit again", "Rushed visit", "Long wait", "Unclear advice"] as const;

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
  receptionists: Receptionist[];
  labs: Lab[];
  labOrders: LabOrder[];
  labMessages: LabMessage[];
  volunteerSessions: VolunteerSession[];
  volunteerBookings: VolunteerBooking[];
  sessionUserId: string | null;
}

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const now = () => new Date().toISOString();
export const todayStr = clinicDate;

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
    pharmacies: [], medicines: [], labs: [], labOrders: [], labMessages: [], volunteerSessions: [], volunteerBookings: [],
    receptionists: [{ id: "u-rec1", doctorId: "u-doc1", name: "Front Desk", email: "desk@sahoolat.test", phone: "03001234567", permissions: { book: true, queue: true, checkIn: true, cancel: false } }],
    sessionUserId: null,
  };
}

// ---------- Store plumbing ----------
/** Supabase is used everywhere except unit tests (which run on the seed data). */
const SB = import.meta.env.MODE !== "test";
const DEFAULT_SETTINGS: Settings = { doctorVerification: true, checkInMethods: { appointmentId: true, phone: true }, joinWindowMinutes: 10, allowedFileTypes: ["pdf", "jpg", "jpeg", "png"], turnApproachingAhead: 1 };
const emptyState = (): State => ({ users: [], doctors: [], patients: [], availability: [], appointments: [], consultations: [], notifications: [], settings: DEFAULT_SETTINGS, reviews: [], pharmacies: [], medicines: [], receptionists: [], labs: [], labOrders: [], labMessages: [], volunteerSessions: [], volunteerBookings: [], sessionUserId: null });
let state: State = SB ? emptyState() : seed();
let ready = !SB;
let hydrating = false;
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
function set(fn: (s: State) => State) {
  const prev = state;
  state = expireAppointments(fn(state));
  emit();
  if (SB && !hydrating) void syncDiff(prev, state);
}

// ---------- Supabase sync ----------
type TableKey = "users" | "doctors" | "patients" | "availability" | "appointments" | "consultations" | "notifications" | "reviews" | "pharmacies" | "medicines" | "labs" | "labOrders" | "labMessages" | "volunteerSessions" | "volunteerBookings";
/* eslint-disable @typescript-eslint/no-explicit-any */
const TABLES: { key: TableKey; table: string; id: (x: any) => string; row: (x: any) => Record<string, unknown>; from: (r: any) => any }[] = [
  { key: "users", table: "profiles", id: (u) => u.id, row: (u) => { const { password: _p, ...d } = u; return { id: u.id, role: u.role, data: d }; }, from: (r) => ({ ...r.data, id: r.id, role: r.role, password: "" }) },
  { key: "doctors", table: "doctors", id: (d) => d.userId, row: (d) => ({ id: d.userId, data: d }), from: (r) => ({ ...r.data, userId: r.id }) },
  { key: "patients", table: "patients", id: (p) => p.userId, row: (p) => ({ id: p.userId, data: p }), from: (r) => ({ ...r.data, userId: r.id }) },
  { key: "availability", table: "availability", id: (a) => a.doctorId, row: (a) => ({ id: a.doctorId, data: a }), from: (r) => ({ ...r.data, doctorId: r.id }) },
  { key: "appointments", table: "appointments", id: (a) => a.id, row: (a) => ({ id: a.id, doctor_id: a.doctorId, patient_id: a.patientId, data: { ...a, documents: stripDocs(a.documents) } }), from: (r) => ({ documents: [], ...r.data, id: r.id, trackingNumber: r.tracking_number, status: appointmentStatus(r.data.date, r.data.status) }) },
  { key: "consultations", table: "consultations", id: (c) => c.appointmentId, row: (c) => ({ id: c.appointmentId, doctor_id: c.doctorId, patient_id: c.patientId, data: { ...c, documents: stripDocs(c.documents) } }), from: (r) => ({ prescription: [], documents: [], ...r.data, appointmentId: r.id }) },
  { key: "notifications", table: "notifications", id: (n) => n.id, row: (n) => ({ id: n.id, user_id: n.userId, data: n }), from: (r) => ({ ...r.data, id: r.id }) },
  { key: "pharmacies", table: "pharmacies", id: (p) => p.userId, row: (p) => ({ id: p.userId, data: p }), from: (r) => ({ ...r.data, userId: r.id }) },
  { key: "medicines", table: "medicines", id: (m) => m.id, row: (m) => ({ id: m.id, pharmacy_id: m.pharmacyId, data: m }), from: (r) => ({ ...r.data, id: r.id, pharmacyId: r.pharmacy_id }) },
  { key: "labs", table: "labs", id: (l) => l.userId, row: (l) => ({ id: l.userId, data: l }), from: (r) => ({ ...r.data, userId: r.id }) },
  { key: "labOrders", table: "lab_orders", id: (o) => o.id, row: (o) => ({ id: o.id, lab_id: o.labId, patient_id: o.patientId, doctor_id: o.doctorId, appointment_id: o.appointmentId, data: { ...o, documents: stripDocs(o.documents) } }), from: (r) => ({ documents: [], ...r.data, id: r.id, trackingNumber: r.tracking_number, status: appointmentStatus(r.data.date, r.data.status), labId: r.lab_id, patientId: r.patient_id, doctorId: r.doctor_id, appointmentId: r.appointment_id }) },
  { key: "labMessages", table: "lab_messages", id: (m) => m.id, row: (m) => ({ id: m.id, order_id: m.orderId, author_id: m.authorId, data: m }), from: (r) => ({ ...r.data, id: r.id, orderId: r.order_id, authorId: r.author_id }) },
  { key: "volunteerSessions", table: "volunteer_sessions", id: (v) => v.id, row: (v) => ({ id: v.id, doctor_id: v.doctorId, data: v }), from: (r) => ({ ...r.data, id: r.id, doctorId: r.doctor_id }) },
  { key: "volunteerBookings", table: "volunteer_bookings", id: (b) => b.id, row: (b) => ({ id: b.id, session_id: b.sessionId, patient_id: b.patientId, data: b }), from: (r) => ({ ...r.data, id: r.id, sessionId: r.session_id, patientId: r.patient_id }) },
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
      if (t.key === "appointments" && String(t.id(x)).startsWith("q-")) continue; // anonymous queue position, read-only
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
  // Patients only receive anonymous queue positions for other bookings on their days.
  const peers = await supabase.rpc("queue_peers");
  if (!peers.error && peers.data?.length) {
    const own = new Set(next.appointments.map((a) => a.id));
    const masked = (peers.data as { id: string; doctor_id: string; data: Record<string, unknown> }[])
      .filter((r) => !own.has(r.id))
      .map((r) => ({ reason: "", documents: [], createdAt: "", ...r.data, id: r.id, doctorId: r.doctor_id, patientId: "" }) as unknown as Appointment);
    next.appointments = [...next.appointments, ...masked];
  }
  const rec = await supabase.from("receptionists").select("*");
  next.receptionists = (rec.data ?? []).map((r: { id: string; doctor_id: string; data: Record<string, unknown> }) => ({ ...(r.data as object), id: r.id, doctorId: r.doctor_id }) as Receptionist);
  const notes = await supabase.from("private_notes").select("id, notes");
  const noteMap = new Map((notes.data ?? []).map((n: { id: string; notes: string }) => [n.id, n.notes]));
  next.consultations = next.consultations.map((c) => ({ ...c, privateNotes: noteMap.get(c.appointmentId) ?? "" }));
  const paths = [...next.appointments, ...next.consultations, ...next.labOrders].flatMap((x) => x.documents.map((d) => d.path)).filter((p): p is string => !!p);
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("documents").createSignedUrls(paths, 60 * 60 * 6);
    const urls = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
    const sign = (docs: DocFile[]) => docs.map((d) => (d.path && urls.get(d.path) ? { ...d, url: urls.get(d.path)! } : d));
    next.appointments = next.appointments.map((a) => ({ ...a, documents: sign(a.documents) }));
    next.consultations = next.consultations.map((c) => ({ ...c, documents: sign(c.documents) }));
    next.labOrders = next.labOrders.map((o) => ({ ...o, documents: sign(o.documents) }));
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
function expireAppointments(s: State): State {
  const today = todayStr();
  return { ...s,
    appointments: s.appointments.map((a) => ({ ...a, status: appointmentStatus(a.date, a.status, today) })),
    labOrders: s.labOrders.map((o) => ({ ...o, status: appointmentStatus(o.date, o.status, today) })),
  };
}
/** Public numeric tracking number is separate from immutable record links. */
export function trackingNumber(record: { id: string; trackingNumber?: string }) {
  return record.trackingNumber ?? state.appointments.find((a) => a.id === record.id)?.trackingNumber ?? (/^\d+$/.test(record.id) ? record.id : record.id.replace(/\D/g, ""));
}
function numericTrackingNumber() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return BigInt("0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")).toString();
}

function notify(userId: string, title: string, body: string, link?: string) {
  if (userId.startsWith("walkin-")) return notifyWalkIn(userId, title, body);
  set((s) => ({ ...s, notifications: [{ id: uid("N"), userId, title, body, at: now(), read: false, link }, ...s.notifications] }));
}

/** Patients without an account: queue a phone message (sent once WhatsApp is connected) and copy it to reception. */
function notifyWalkIn(patientId: string, title: string, body: string) {
  const a = [...state.appointments].reverse().find((x) => x.patientId === patientId);
  if (!a?.walkIn) return;
  const text = `${title}: ${body}`;
  if (SB) void import("./supabase").then(({ supabase }) => supabase.from("message_outbox").insert({ phone: a.walkIn!.phone, body: `Sahoolat — ${text}`, appointment_id: a.id })).then((r) => { if (r?.error) void reportSyncError(r.error.message); });
  const to = new Set([...state.receptionists.filter((r) => r.doctorId === a.doctorId).map((r) => r.id), ...(a.bookedBy ? [a.bookedBy] : [])]);
  for (const id of to) set((s) => ({ ...s, notifications: [{ id: uid("N"), userId: id, title: `${a.walkIn!.name} (${a.walkIn!.phone}) — ${title}`, body, at: now(), read: false, link: "/reception" }, ...s.notifications] }));
}

/** Reception books for someone without an app account; they are queued like everyone else. */
export async function bookWalkIn(input: { clinicId?: string; clinicName?: string; clinicAddress?: string; doctorId: string; date: string; reason: string; type: ConsultType; name: string; phone: string; age?: number; gender?: string }) {
  const me = state.sessionUserId;
  const rec = state.receptionists.find((r) => r.id === me);
  if (!rec || rec.doctorId !== input.doctorId || !rec.permissions.book) throw new Error("You are not allowed to book for this doctor");
  const name = input.name.trim(), phone = input.phone.replace(/[^\d+]/g, "");
  if (name.length < 2) throw new Error("Enter the patient's name");
  if (phone.replace(/\D/g, "").length < 10) throw new Error("Enter a valid mobile number");
  return bookAppointment({ clinicId: input.clinicId, clinicName: input.clinicName, clinicAddress: input.clinicAddress, doctorId: input.doctorId, patientId: `walkin-${crypto.randomUUID()}`, type: input.type, date: input.date, reason: input.reason.trim() || "Walk-in", documents: [], memberName: name, walkIn: { name, phone, age: input.age, gender: input.gender }, bookedBy: me ?? undefined });
}

/** Doctor changes what a reception account may do. */
export async function updateReceptionPermissions(id: string, permissions: ReceptionPermissions) {
  const r = state.receptionists.find((x) => x.id === id);
  if (!r) return;
  if (SB) {
    const { supabase } = await import("./supabase");
    const { id: _i, doctorId: _d, ...data } = { ...r, permissions };
    const { error } = await supabase.from("receptionists").update({ data }).eq("id", id);
    if (error) throw new Error(error.message);
  }
  const prev = hydrating; hydrating = true;
  set((s) => ({ ...s, receptionists: s.receptionists.map((x) => (x.id === id ? { ...x, permissions } : x)) }));
  hydrating = prev;
}
export const receptionFor = (userId: string | null | undefined, s: State = state) => s.receptionists.find((r) => r.id === userId);
export async function refreshAll() { await hydrate(state.sessionUserId); }

// ---------- Selectors / helpers ----------
export const userById = (id: string) => state.users.find((u) => u.id === id);
export const doctorById = (id: string) => state.doctors.find((d) => d.userId === id);
export const patientById = (id: string) => state.patients.find((p) => p.userId === id);
export const useSession = () => useStore((s) => s.users.find((u) => u.id === s.sessionUserId) ?? null);

export function slotDateTime(a: { date: string; time: string }) {
  return parse(`${a.date} ${a.time}`, "yyyy-MM-dd HH:mm", new Date());
}

const BLOCKING: AppointmentStatus[] = ["Cancelled", "Rescheduled", "No Show"];

export function clinicAvailability(doctorId: string, clinicId?: string, s: State = state): Availability | undefined {
  const av = s.availability.find(a => a.doctorId === doctorId);
  return clinicId ? av?.clinics?.[clinicId] : av;
}
export async function uploadCredential(file: File): Promise<string> {
  const me = state.sessionUserId;
  if (!me) throw new Error('Sign in first');
  if (!['application/pdf','image/jpeg','image/png'].includes(file.type) || file.size > 10485760) throw new Error('Choose a PDF, JPG or PNG up to 10 MB');
  const path = `credentials/${me}/${crypto.randomUUID()}`;
  if (SB) { const { supabase } = await import('./supabase'); const { error } = await supabase.storage.from('documents').upload(path, file); if (error) throw new Error(error.message); }
  return path;
}
export async function credentialUrl(path: string) {
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 300);
  if (error) throw new Error(error.message); return data.signedUrl;
}

export function dailyCapacity(av: Availability, date?: string): number {
  if (date) return scheduleShifts(av, date).reduce((sum, shift) => sum + shift.capacity, 0);
  if (av.weeklyShifts) return Math.max(0, ...Object.values(av.weeklyShifts).map((shifts) => shifts.reduce((sum, shift) => sum + shift.capacity, 0)));
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  return av.dailyLimit ?? Math.max(1, Math.floor((minutes(av.end) - minutes(av.start)) / av.duration));
}

/** Auto-generated slots for a doctor on a date, booked ones excluded. */
export function getSlots(doctorId: string, date: string, s: State = state, clinicId?: string): { time: string; available: boolean; blocked?: boolean; booked?: boolean }[] {
  const av = clinicAvailability(doctorId, clinicId, s);
  if (!av) return [];
  const shifts = scheduleShifts(av, date);
  const dayOff = av.blockedDays?.includes(date) ?? false;
  const capacity = dailyCapacity(av, date);
  const bookedToday = s.appointments.filter((a) => a.doctorId === doctorId && sameClinic(a, { clinicId }) && a.date === date && !BLOCKING.includes(a.status));
  const out: { time: string; available: boolean; blocked?: boolean; booked?: boolean }[] = [];
  const takenCount = new Map<string, number>();
  for (const a of bookedToday.filter((x) => !BLOCKING.includes(x.status))) takenCount.set(a.time, (takenCount.get(a.time) ?? 0) + 1);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
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
  // Planned slots may all be past while the shift is still running: offer the next minute.
  const nowTime = localNow.slice(11);
  const late = format(addMinutes(parse(`${date} ${nowTime}`, "yyyy-MM-dd HH:mm", new Date()), 1), "HH:mm");
  if (localNow.slice(0, 10) === date && !dayOff && usedInShift < shiftCap && bookedToday.length < capacity
    && late > shift.start && late < shift.end && !out.some((x) => x.available && x.time >= shift.start && x.time < shift.end)
    && !(av.blocked?.includes(`${date} ${late}`) ?? false)) out.push({ time: late, available: true });
  }
  return out;
}

export function nextBooking(doctorId: string, date: string, s: State = state, clinicId?: string) {
  const slot = getSlots(doctorId, date, s, clinicId).find((x) => x.available);
  return slot ? { time: slot.time, queueNumber: nextQueueNumber(doctorId, date, s, clinicId) } : null;
}

export function nextAvailableDate(doctorId: string, clinicId?: string): string | null {
  for (let i = 0; i < 30; i++) {
    const d = format(addDays(new Date(), i), "yyyy-MM-dd");
    if (getSlots(doctorId, d, state, clinicId).some((x) => x.available)) return d;
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
const FINISHED: AppointmentStatus[] = ["Completed", "Cancelled", "No Show", "Rescheduled", "Expired"];

export function dayAppointments(doctorId: string, date: string, s: State = state, clinicId?: string) {
  return s.appointments.filter((a) => a.doctorId === doctorId && sameClinic(a, { clinicId }) && a.date === date && a.status !== "Rescheduled" && a.status !== "Cancelled").sort((a, b) => a.time.localeCompare(b.time));
}

/** In the active queue: online confirmed/waiting/ready, clinic only once checked in. */
export function inActiveQueue(a: Appointment) {
  if (FINISHED.includes(appointmentStatus(a.date, a.status))) return false;
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
  const day = dayAppointments(a.doctorId, a.date, s, a.clinicId);
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

function nextQueueNumber(doctorId: string, date: string, s: State, clinicId?: string) {
  return s.appointments.filter((a) => a.doctorId === doctorId && sameClinic(a, { clinicId }) && a.date === date && !BLOCKING.includes(a.status)).reduce((m, a) => Math.max(m, a.queueNumber), 0) + 1;
}

function patchAppt(id: string, p: Partial<Appointment>) {
  set((s) => ({ ...s, appointments: s.appointments.map((a) => (a.id === id ? { ...a, ...p } : a)) }));
}

/** Minutes until the patient's turn: patients ahead × time per patient, never earlier than the booked time. */
export function minutesUntilTurn(id: string, s: State = state) {
  const a = s.appointments.find((x) => x.id === id);
  const q = queueInfo(id, s);
  if (!a || !q) return null;
  const per = clinicAvailability(a.doctorId, a.clinicId, s)?.consultMinutes ?? 15;
  const byQueue = q.ahead * per;
  const byTime = (slotDateTime(a).getTime() - Date.now()) / 60000;
  return Math.max(0, Math.round(Math.max(byQueue, byTime)));
}
/** Patient shared location: send one 'time to leave' alert when travel time ≥ time left before their turn. */
export function checkLeaveAlert(id: string, pos: { lat: number; lng: number }) {
  const a = state.appointments.find((x) => x.id === id);
  if (!a || a.type !== "clinic" || a.date !== todayStr() || a.leaveAlertAt || !["Confirmed", "Pending"].includes(a.status)) return null;
  const d = state.doctors.find((x) => x.userId === a.doctorId);
  const lat = a.clinicId ? a.clinicLat : d?.clinicLat;
  const lng = a.clinicId ? a.clinicLng : d?.clinicLng;
  if (lat == null || lng == null) return null;
  const km = distanceKm(pos, { lat, lng });
  const travel = travelMinutes(km);
  const left = minutesUntilTurn(id);
  if (left == null || km < 0.3 || travel < left) return { km, travel, left, sent: false };
  patchAppt(id, { leaveAlertAt: now() });
  notify(a.patientId, "Time to leave for your appointment", `You are about ${km.toFixed(1)} km (~${travel} min) from the clinic and your turn (Queue #${a.queueNumber}) is in about ${left} min. Please leave now.`, `/patient/appointments/${id}`);
  return { km, travel, left, sent: true };
}

const waitingToday = (doctorId: string, clinicId?: string) => dayAppointments(doctorId, todayStr(), state, clinicId).filter((a) => ["Confirmed", "Pending", "Waiting", "Checked-In"].includes(a.status));
/** Doctor pauses the queue (emergency break); waiting patients are told. */
export async function startBreak(doctorId: string, clinicId?: string) {
  const av = clinicAvailability(doctorId,clinicId);
  if (!av || av.breakStartedAt) return;
  await persistAvailability({ ...av, breakStartedAt: now() });
  const doc = userById(doctorId)?.name ?? "The doctor";
  for (const a of waitingToday(doctorId,clinicId)) notify(a.patientId, "Emergency break — queue paused", `${doc} is on an emergency break. Your queue (#${a.queueNumber}) is paused; we'll send your updated time when it resumes.`, `/patient/appointments/${a.id}`);
}
/** Doctor resumes: today's waiting times move later by the break length and patients get their new time. */
export async function endBreak(doctorId: string, clinicId?: string) {
  const av = clinicAvailability(doctorId,clinicId);
  if (!av?.breakStartedAt) return 0;
  const minutes = Math.max(0, Math.round((Date.now() - new Date(av.breakStartedAt).getTime()) / 60000));
  const { breakStartedAt: _, ...rest } = av;
  if (minutes > 0) {
    if (SB) {
      const { supabase } = await import("./supabase");
      const { error } = await supabase.rpc("shift_clinic_queue_times", { _clinic: clinicId ?? "", _doctor: doctorId, _date: todayStr(), _minutes: minutes });
      if (error) throw new Error(error.message);
    } else {
      const ids = new Set(waitingToday(doctorId,clinicId).map((a) => a.id));
      const shift = (t: string) => { const m = Math.min(23 * 60 + 59, Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) + minutes); return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
      const prev = hydrating; hydrating = true;
      set((s) => ({ ...s, appointments: s.appointments.map((a) => (ids.has(a.id) ? { ...a, time: shift(a.time) } : a)) }));
      hydrating = prev;
    }
  }
  await persistAvailability(rest as Availability);
  const doc = userById(doctorId)?.name ?? "The doctor";
  for (const a of waitingToday(doctorId,clinicId)) notify(a.patientId, "Queue resumed — updated time", `${doc} is back. Queue #${a.queueNumber} — your updated time is ${fmtTime(a.time)}${minutes ? ` (moved ${minutes} min later)` : ""}.`, `/patient/appointments/${a.id}`);
  return minutes;
}

function notifyApproaching(doctorId: string, date: string) {
  const day = dayAppointments(doctorId, date);
  const waiting = day.filter(inActiveQueue).filter((x) => x.status !== "In Consultation" && x.status !== "Ready to Join");
  waiting.slice(0, state.settings.turnApproachingAhead + 1).forEach((x, i) => {
    notify(x.patientId, i === 0 ? "You're next" : "Your turn is approaching", `Queue #${x.queueNumber} — ${i} patient(s) ahead of you.`, `/patient/appointments/${x.id}`);
  });
}

// ---------- Auth ----------
export function addReview(input: { appointmentId: string; rating: number; comment: string; aspects?: Review["aspects"]; waitTime?: ReviewWait; recommend?: boolean; tags?: string[] }) {
  const a = state.appointments.find((x) => x.id === input.appointmentId);
  if (!a || a.status !== "Completed") throw new Error("You can only review completed appointments");
  if (state.reviews.some((r) => r.appointmentId === a.id)) throw new Error("You already reviewed this visit");
  if (input.rating < 1 || input.rating > 5) throw new Error("Choose 1 to 5 stars");
  for (const [k, v] of Object.entries(input.aspects ?? {})) if (!(REVIEW_ASPECTS as readonly string[]).includes(k) || !Number.isInteger(v) || v! < 1 || v! > 5) throw new Error("Rate each question from 1 to 5");
  if (input.waitTime && !(REVIEW_WAITS as readonly string[]).includes(input.waitTime)) throw new Error("Choose a valid waiting time");
  const tags = [...new Set(input.tags ?? [])].filter((t) => (REVIEW_TAGS as readonly string[]).includes(t));
  const r: Review = { id: uid("R"), appointmentId: a.id, doctorId: a.doctorId, patientId: a.patientId, rating: input.rating, comment: input.comment.trim().slice(0, 1000), at: now(), aspects: input.aspects, waitTime: input.waitTime, recommend: input.recommend, tags };
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
  // Email confirmation may be required: the account exists but has no session yet.
  if (!data.session) return data.user.id;
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
export async function registerLab(input: { name: string; email: string; phone: string; password: string; labName: string; address: string; city: string }): Promise<string> {
  const { name, email, phone, password, ...p } = input;
  if (SB) return signUp(email, password, { role: "lab", name, phone, profile: p });
  if (state.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) throw new Error("Email already registered");
  const id = uid("u");
  set((s) => ({ ...s, users: [...s.users, { id, role: "lab", name, email, phone, password, active: true, createdAt: now() }], labs: [...s.labs, { userId: id, phone, ...p }], sessionUserId: id }));
  return id;
}
export function updateLab(id: string, p: Partial<Lab>) {
  if (p.testCatalogue) validateLabTests(p.testCatalogue);
  set((s) => ({ ...s, labs: s.labs.map((x) => (x.userId === id ? { ...x, ...p } : x)) }));
}
export async function saveLabDetails(id: string, p: Partial<Lab>) {
  if (state.sessionUserId !== id) throw new Error("Only the laboratory can edit its details");
  const lab = state.labs.find((l) => l.userId === id);
  if (!lab) throw new Error("Laboratory not found");
  if (p.testCatalogue) validateLabTests(p.testCatalogue);
  const next = { ...lab, ...p };
  await writeRow("labs", { id, data: next }, false);
  hydrating = true;
  try { set((s) => ({ ...s, labs: s.labs.map((l) => l.userId === id ? next : l) })); }
  finally { hydrating = false; }
}
export async function saveLabSchedule(id: string, schedule: LabSchedule) {
  if (state.sessionUserId !== id) throw new Error("Only the laboratory can set its availability");
  validateLabSchedule(schedule);
  const lab = state.labs.find((l) => l.userId === id);
  if (!lab) throw new Error("Laboratory not found");
  const next = { ...lab, schedule };
  await writeRow("labs", { id, data: next }, false);
  hydrating = true;
  try { set((s) => ({ ...s, labs: s.labs.map((l) => l.userId === id ? next : l) })); }
  finally { hydrating = false; }
}
export async function getLabSlots(labId: string, date: string, excludeId?: string) {
  const schedule = state.labs.find((l) => l.userId === labId)?.schedule;
  if (!SB) return labSlots(schedule, date, state.labOrders.filter((o) => o.labId === labId && o.id !== excludeId));
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("lab_slot_usage", { target_lab: labId, target_date: date });
  if (error) throw new Error(error.message);
  const current = state.labOrders.find((o) => o.id === excludeId);
  return labSlots(schedule, date, (data ?? []).map((r: { booked_time: string; duration: number; bookings: number }) => ({ date, time: r.booked_time, slotMinutes: r.duration, status: "Requested", count: r.bookings - (current?.date === date && current.time === r.booked_time && (current.slotMinutes ?? schedule?.slotMinutes) === r.duration ? 1 : 0) })));
}
/** Consultations that carry a doctor's prescription or test recommendation (required to book a lab test). */
export function prescribedConsultations(patientId: string, s: State = state) {
  return s.consultations.filter((c) => c.patientId === patientId && (c.prescription.length > 0 || !!c.labTests?.trim()));
}
async function writeRow(table: string, row: Record<string, unknown>, insert: boolean) {
  if (!SB) return;
  const { supabase } = await import("./supabase");
  const { error } = insert ? await supabase.from(table).insert(row as never) : await supabase.from(table).update(row as never).eq("id", row.id as string);
  if (error) throw new Error(error.message);
}
const labOrderTable = () => {
  const table = TABLES.find((t) => t.key === "labOrders");
  if (!table) throw new Error("Lab orders are unavailable");
  return table;
};
function commitLabOrder(o: LabOrder) {
  hydrating = true;
  try { set((s) => ({ ...s, labOrders: s.labOrders.some((x) => x.id === o.id) ? s.labOrders.map((x) => (x.id === o.id ? o : x)) : [o, ...s.labOrders] })); }
  finally { hydrating = false; }
}
async function notifyLabAppointment(userId: string, title: string, body: string, link: string) {
  const n = { id: uid("N"), userId, title, body, at: now(), read: false, link };
  await writeRow("notifications", { id: n.id, user_id: userId, data: n }, true);
  hydrating = true;
  try { set((s) => ({ ...s, notifications: [n, ...s.notifications] })); }
  finally { hydrating = false; }
}
/** Doctor orders a test, or patient books one against their own prescription. Awaits the server write. */
export async function createLabOrder(input: { labId: string; appointmentId: string; tests: string; date: string; time?: string; notes?: string }): Promise<LabOrder> {
  const me = state.users.find((u) => u.id === state.sessionUserId);
  if (!me) throw new Error("Please sign in");
  if (!state.labs.some((l) => l.userId === input.labId)) throw new Error("Choose a laboratory");
  if (!input.tests.trim()) throw new Error("Enter the tests to perform");
  if (!input.date) throw new Error("Choose a date");
  let doctorId: string, patientId: string, memberName: string | undefined;
  if (me.role === "doctor") {
    const a = consultationAppointment(input.appointmentId);
    if (!a || a.doctorId!==me.id) throw new Error("Appointment not found");
    doctorId = me.id; patientId = a.patientId; memberName = a.memberName;
  } else if (me.role === "patient") {
    const lab = state.labs.find((l) => l.userId === input.labId);
    const needRx = testsNeedingPrescription(lab ? labTestCatalogue(lab) : [], input.tests);
    if (!input.appointmentId) {
      if (needRx.length) throw new Error(`A doctor's prescription is required for: ${needRx.join(", ")}`);
      doctorId = ""; patientId = me.id;
    } else {
      const c = prescribedConsultations(me.id).find((x) => x.appointmentId === input.appointmentId);
      if (!c) throw new Error("Prescription not found");
      doctorId = c.doctorId; patientId = me.id; memberName = consultationAppointment(c.appointmentId)?.memberName;
    }
  } else throw new Error("Only doctors and patients can book lab tests");
  if (!input.time) throw new Error("Choose an available lab appointment time");
  const schedule = state.labs.find((l) => l.userId === input.labId)?.schedule;
  if (!schedule) throw new Error("This laboratory has not set its availability yet");
  if (!(await getLabSlots(input.labId, input.date)).some((s) => s.time === input.time && s.available)) throw new Error("The laboratory is unavailable at this time");
  let o: LabOrder = { id: numericTrackingNumber(), labId: input.labId, patientId, doctorId, appointmentId: input.appointmentId, memberName, tests: input.tests.trim(), date: input.date, time: input.time, slotMinutes: schedule.slotMinutes, notes: input.notes?.trim() || undefined, orderedBy: me.role, status: "Requested", documents: [], createdAt: now() };
  if (SB) {
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase.from("lab_orders").insert(labOrderTable().row(o) as never).select("*").single();
    if (error) throw new Error(error.message);
    o = labOrderTable().from(data) as LabOrder;
  } else o = { ...o, token: nextLabToken(o.labId, o.date) };
  commitLabOrder(o);
  const lab = state.labs.find((l) => l.userId === o.labId);
  await notifyLabAppointment(o.labId, "New lab test request", `${trackingNumber(o)}: ${o.tests} on ${o.date} at ${fmtTime(o.time ?? "")}${me.role === "doctor" ? ` — ordered by ${me.name}` : ""}.`, "/lab");
  await notifyLabAppointment(patientId, "Lab appointment booked", `${o.tests} at ${lab?.labName ?? "the laboratory"} on ${o.date} at ${fmtTime(o.time ?? "")}. Token #${o.token ?? "—"} · Tracking: ${trackingNumber(o)}. Please arrive at your time.`, "/patient/labs");
  return o;
}
/** Next lab token for a day (local mirror; the database assigns the authoritative one). */
export function nextLabToken(labId: string, date: string, exceptId?: string) {
  return Math.max(0, ...state.labOrders.filter((o) => o.labId === labId && o.date === date && o.id !== exceptId).map((o) => o.token ?? 0)) + 1;
}
export async function scheduleLabOrder(id: string, date: string, time: string) {
  const order = state.labOrders.find((o) => o.id === id);
  if (!order || order.labId !== state.sessionUserId) throw new Error("Only the laboratory can change the appointment time");
  if (order.status !== "Requested") throw new Error("Only pending test appointments can be scheduled");
  if (!(await getLabSlots(order.labId, date, id)).some((s) => s.time === time && s.available)) throw new Error("The laboratory is unavailable at this time");
  let next: LabOrder = { ...order, date, time, slotMinutes: state.labs.find((l) => l.userId === order.labId)?.schedule?.slotMinutes };
  if (date !== order.date) next.token = nextLabToken(order.labId, date, id);
  await writeRow("lab_orders", labOrderTable().row(next), false);
  if (SB) {
    const { supabase } = await import("./supabase");
    const { data } = await supabase.from("lab_orders").select("*").eq("id", id).maybeSingle();
    if (data) next = labOrderTable().from(data) as LabOrder;
  }
  commitLabOrder(next);
  await notifyLabAppointment(order.patientId, "Lab appointment time updated", `${order.tests}: ${date} at ${fmtTime(time)}. Tracking: ${trackingNumber(order)}.`, "/patient/labs");
  await notifyLabAppointment(order.doctorId, "Lab appointment time updated", `${order.tests}: ${date} at ${fmtTime(time)}.`, "/doctor/labs");
}
export async function setLabOrderStatus(id: string, status: LabOrderStatus) {
  const o = state.labOrders.find((x) => x.id === id);
  if (!o) throw new Error("Order not found");
  if (appointmentStatus(o.date, o.status) === "Expired") throw new Error("This lab appointment has ended. Book a new appointment.");
  const next = { ...o, status };
  await writeRow("lab_orders", labOrderTable().row(next), false);
  commitLabOrder(next);
  if (status === "Cancelled") notify(state.sessionUserId === o.labId ? o.patientId : o.labId, "Lab test cancelled", `${trackingNumber(o)}: ${o.tests}.`, state.sessionUserId === o.labId ? "/patient/labs" : "/lab");
  else if (status === "Sample collected") notify(o.patientId, "Sample collected", `${trackingNumber(o)}: your sample for ${o.tests} was collected.`, "/patient/labs");
}
/** Lab uploads results; files are stored permanently and appear in the patient's health records. */
export async function uploadLabResults(id: string, files: FileList | File[], correctionOf?: string) {
  const o = state.labOrders.find((x) => x.id === id);
  if (!o || o.labId !== state.sessionUserId) throw new Error("Only the assigned laboratory can upload results");
  const docs = makeDocs(files, "lab", "Lab Report").map((d) => ({ ...d, version: Math.max(0, ...o.documents.map((x) => x.version ?? 1)) + 1, correctionOf }));
  if (SB) {
    const { supabase } = await import("./supabase");
    for (const d of docs) {
      const path = `lab/${o.id}/${d.id}-${d.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("documents").upload(path, pendingFiles.get(d.id) ?? new File([], d.name), { contentType: d.mime, upsert: false });
      if (error) throw new Error(`${d.name}: ${error.message}`);
      d.path = path; pendingFiles.delete(d.id);
    }
  }
  const next: LabOrder = { ...o, documents: [...o.documents, ...docs], status: "Completed", completedAt: o.completedAt ?? now() };
  await writeRow("lab_orders", labOrderTable().row(next), false);
  commitLabOrder(next);
  const lab = state.labs.find((l) => l.userId === o.labId);
  notify(o.patientId, "Lab report ready", `${lab?.labName ?? "The laboratory"} uploaded your ${o.tests} report. See Health Records.`, "/patient/records");
  notify(o.doctorId, "Lab report ready", `${o.tests} report for ${o.memberName ?? userById(o.patientId)?.name ?? "your patient"} is available.`, `/doctor/consultation/${o.appointmentId}`);
}
/** Patient and the prescribing doctor discuss a lab report. */
export async function postLabMessage(orderId: string, body: string) {
  const o = state.labOrders.find((x) => x.id === orderId);
  const me = state.sessionUserId;
  if (!o || !me || (me !== o.patientId && me !== o.doctorId)) throw new Error("Only the patient and doctor can discuss this report");
  const text = body.trim().slice(0, 2000);
  if (!text) throw new Error("Write a message");
  const m: LabMessage = { id: uid("LM"), orderId, authorId: me, body: text, at: now() };
  await writeRow("lab_messages", TABLES.find((t) => t.key === "labMessages")!.row(m), true);
  hydrating = true;
  try { set((s) => ({ ...s, labMessages: [...s.labMessages, m] })); } finally { hydrating = false; }
  const to = me === o.patientId ? o.doctorId : o.patientId;
  notify(to, "New message on lab report", `${userById(me)?.name ?? "Someone"}: ${text.slice(0, 80)}`, to === o.doctorId ? "/doctor/labs" : "/patient/labs");
}
export function updatePharmacy(id: string, p: Partial<Pharmacy>) {
  set((s) => ({ ...s, pharmacies: s.pharmacies.map((x) => (x.userId === id ? { ...x, ...p } : x)) }));
}
export function saveMedicine(m: Omit<Medicine, "id" | "updatedAt"> & { id?: string }): Medicine {
  if (!m.name.trim()) throw new Error("Medicine name is required");
  if (!(m.price >= 0)) throw new Error("Price must be a number");
  if (m.quantity !== undefined && (!Number.isInteger(m.quantity) || m.quantity < 0)) throw new Error("Stock quantity must be a non-negative integer");
  if (m.lowStock !== undefined && (!Number.isInteger(m.lowStock) || m.lowStock < 0)) throw new Error("Low-stock threshold must be a non-negative integer");
  const old = state.medicines.find(x=>x.id===m.id);
  const full: Medicine = { ...m, id: m.id ?? uid("MED"), name: m.name.trim(), updatedAt: now() };
  set((s) => ({ ...s, medicines: m.id ? s.medicines.map((x) => (x.id === m.id ? full : x)) : [full, ...s.medicines] }));
  if (!SB && full.quantity !== undefined && full.quantity <= (full.lowStock ?? 5) && (!old || old.quantity === undefined || old.quantity > (old.lowStock ?? 5))) notify(full.pharmacyId, "Medicine running low", `${full.name}: ${full.quantity} left — out of stock soon.`, "/pharmacy");
  return full;
}
export function deleteMedicine(id: string) {
  set((s) => ({ ...s, medicines: s.medicines.filter((x) => x.id !== id) }));
}
/** Search in-stock medicines across all pharmacies by name or formula. */
export function searchMedicines(st: { medicines: Medicine[]; pharmacies: Pharmacy[] }, q: string, city = "") {
  const t = q.trim().toLowerCase();

  return st.medicines
    .filter((m) => m.inStock && (m.quantity === undefined || m.quantity > 0) && (!m.expiry || m.expiry >= todayStr()) && (!t || m.name.toLowerCase().includes(t) || (m.formula ?? "").toLowerCase().includes(t)))
    .flatMap((m) => {const p=st.pharmacies.find(p=>p.userId===m.pharmacyId);return p?[{m,p}]:[];})
    .filter((x) => (!city || x.p.city.toLowerCase().includes(city.trim().toLowerCase())))
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
    const next = av.clinicId && old ? { ...old, clinics: { ...old.clinics, [av.clinicId]: av } } : { blocked: old?.blocked ?? [], blockedDays: old?.blockedDays ?? [], ...av };
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
    const { error } = await supabase.from("availability").upsert({ id: av.doctorId, data: av.clinicId ? { ...state.availability.find(a => a.doctorId === av.doctorId), clinics: { ...state.availability.find(a => a.doctorId === av.doctorId)?.clinics, [av.clinicId]: av } } : av });
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
export function toggleBlockedSlot(doctorId: string, date: string, time: string, clinicId?: string) {
  const key = `${date} ${time}`;
  const av = clinicAvailability(doctorId,clinicId);
  const isBlocked = av?.blocked?.includes(key);
  if (!isBlocked && state.appointments.some((a) => a.doctorId === doctorId && sameClinic(a,{clinicId}) && a.date === date && a.time === time && !BLOCKING.includes(a.status))) {
    throw new Error("This slot is already booked — cancel or reschedule the appointment first");
  }
  if(clinicId&&av){void persistAvailability({...av,clinicId,blocked:isBlocked?(av.blocked??[]).filter(k=>k!==key):[...(av.blocked??[]),key]}).catch(e=>void reportSyncError(e.message));return;}
  patchAvailability(doctorId, (a) => ({ ...a, blocked: isBlocked ? (a.blocked ?? []).filter((k) => k !== key) : [...(a.blocked ?? []), key] }));
}
/** Doctor marks a whole date as unavailable (leave, holiday) or available again. */
export function toggleBlockedDay(doctorId: string, date: string, clinicId?: string) {
  if(clinicId){const av=clinicAvailability(doctorId,clinicId);if(!av)return;const list=av.blockedDays??[];void persistAvailability({...av,clinicId,blockedDays:list.includes(date)?list.filter(d=>d!==date):[...list,date]}).catch(e=>void reportSyncError(e.message));return;}
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
  if (state.labOrders.some((o) => o.documents.some((x) => x.id === docId))) throw new Error("Lab reports cannot be deleted");
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
export async function bookAppointment(input: { clinicLat?: number; clinicLng?: number; clinicId?: string; clinicName?: string; clinicAddress?: string; memberId?: string; memberName?: string; doctorId: string; patientId: string; type: ConsultType; date: string; time?: string; reason: string; documents: DocFile[]; followUpOf?: string; payment?: PaymentMethod; rescheduledFrom?: string; patientLat?: number; patientLng?: number; walkIn?: Appointment["walkIn"]; bookedBy?: string }): Promise<Appointment> {
  const previewState = input.rescheduledFrom ? { ...state, appointments: state.appointments.filter((a) => a.id !== input.rescheduledFrom) } : state;
  const slot = nextBooking(input.doctorId, input.date, previewState, input.clinicId);
  if (!slot) throw new Error("No places available on this day. Choose another date.");
  const id = numericTrackingNumber();
  let a: Appointment = { ...input, time: slot.time, payment: input.payment ?? "cash", id, status: "Confirmed", queueNumber: nextQueueNumber(input.doctorId, input.date, state, input.clinicId), createdAt: now() };
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
  notify(input.patientId, "Appointment confirmed", `${trackingNumber(a)} with ${doc?.name} on ${a.date} at ${fmtTime(a.time)} — Queue #${a.queueNumber}.`, `/patient/appointments/${id}`);
  notify(input.doctorId, "New appointment", `${input.memberName ?? pat?.name} booked ${a.date} at ${fmtTime(a.time)} — Queue #${a.queueNumber}.`, `/doctor/appointments`);
  return a;
}

/** Later waiting patients move up one place, taking the previous number and time (mirrors the database). */
function closeQueueGap(a: Appointment) {
  if (SB) return; // the database does this and pushes the new numbers back
  const later = state.appointments.filter((x) => x.doctorId === a.doctorId && sameClinic(x, a) && x.date === a.date && x.id !== a.id && ["Confirmed", "Pending", "Waiting", "Checked-In"].includes(x.status) && x.queueNumber > a.queueNumber).sort((x, y) => x.queueNumber - y.queueNumber);
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
  const msg = `${trackingNumber(a)} on ${a.date} at ${fmtTime(a.time)} was cancelled by ${by}.${reason ? " Reason: " + reason : ""}`;
  if (by !== "patient") notify(a.patientId, "Appointment cancelled", msg, `/patient/appointments/${id}`);
  if (by !== "doctor") notify(a.doctorId, "Appointment cancelled", msg, `/doctor/appointments`);
}

export const cancellableDayAppointments = (doctorId: string, date: string) => state.appointments.filter((a) => a.doctorId === doctorId && a.date === date && ["Pending", "Confirmed", "Waiting", "Checked-In", "Ready to Join"].includes(a.status));
/** All cancellations and patient notices commit together in the database. */
export async function cancelDoctorDay(date: string, reason: string) {
  const doctorId = state.sessionUserId;
  if (!doctorId || !state.doctors.some((d) => d.userId === doctorId)) throw new Error("Only doctors can cancel their day");
  if (reason.trim().length < 3 || reason.length > 1000) throw new Error("Enter a cancellation reason (3–1000 characters)");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayStr()) throw new Error("Choose today or a future date");
  if (SB) {
    const { supabase } = await import("./supabase");
    const { data, error } = await supabase.rpc("cancel_doctor_day", { target_date: date, reason: reason.trim() });
    if (error) throw new Error(error.message);
    await refreshAll();
    return Number(data);
  }
  const appointments = cancellableDayAppointments(doctorId, date);
  for (const a of appointments) cancelAppointment(a.id, "doctor", reason.trim());
  return appointments.length;
}

/** Attendance is limited to the linked doctor's pending clinic patients today. */
export async function receptionAttendance(id: string, arrived: boolean) {
  const a = state.appointments.find((x) => x.id === id);
  const rec = receptionFor(state.sessionUserId);
  if (!a || !rec || rec.doctorId !== a.doctorId || !rec.permissions.checkIn) throw new Error("Arrival permission required for this doctor");
  if (a.date !== todayStr() || a.type !== "clinic" || !["Pending", "Confirmed", "Waiting", "Checked-In"].includes(a.status)) throw new Error("Only today's pending clinic patients can be marked");
  if (SB) {
    const { supabase } = await import("./supabase");
    const { error } = await supabase.rpc("reception_attendance", { target_id: id, arrived });
    if (error) throw new Error(error.message);
    await refreshAll();
  } else if (arrived) patchAppt(id, { status: "Waiting", checkedInAt: now() });
  else markNoShow(id);
}

export async function rescheduleAppointment(id: string, date: string): Promise<Appointment> {
  const old = state.appointments.find((x) => x.id === id);
  if (!old) throw new Error("Appointment not found");
  const fresh = await bookAppointment({ clinicId: old.clinicId, clinicName: old.clinicName, clinicAddress: old.clinicAddress, doctorId: old.doctorId, patientId: old.patientId, memberId: old.memberId, memberName: old.memberName, type: old.type, date, reason: old.reason, documents: old.documents, followUpOf: old.followUpOf, payment: old.payment, rescheduledFrom: id });
  const msg = `${trackingNumber(old)} moved to ${date} at ${fmtTime(fresh.time)} (Queue #${fresh.queueNumber}).`;
  notify(old.patientId, "Appointment rescheduled", msg, `/patient/appointments/${fresh.id}`);
  notify(old.doctorId, "Appointment rescheduled", msg, `/doctor/appointments`);
  return fresh;
}

/** Clinic check-in by appointment ID or phone number (today). */
export function checkIn(method: "appointmentId" | "phone", value: string): Appointment {
  if (!state.settings.checkInMethods[method]) throw new Error("This check-in method is disabled");
  const t = todayStr();
  let a: Appointment | undefined;
  if (method === "appointmentId") a = state.appointments.find((x) => (x.id.toUpperCase() === value.trim().toUpperCase() || trackingNumber(x) === value.trim()));
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

export type KioskQueue = { myNumber: number; currentNumber: number; ahead: number; status: string; doctorName?: string };
/** Live queue position for a checked-in appointment; works signed-out. */
export async function kioskQueueStatus(id: string): Promise<KioskQueue | null> {
  if (!SB) { const q = queueInfo(id); const a = state.appointments.find((x) => x.id === id); return q && a ? { myNumber: q.myNumber, currentNumber: q.currentNumber, ahead: q.ahead, status: a.status, doctorName: userById(a.doctorId)?.name } : null; }
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("kiosk_queue_status", { appt_id: id });
  if (error) throw new Error(error.message);
  return (data as KioskQueue | null) ?? null;
}

/** Look up queue position by tracking number or phone without checking in. */
export async function lookupQueue(method: "appointmentId" | "phone", value: string): Promise<KioskQueue & { date?: string; time?: string }> {
  if (!SB) {
    const v = value.trim();
    const a = state.appointments.find((x) => method === "appointmentId" ? (x.trackingNumber === v || x.id === v) : userById(x.patientId)?.phone.replace(/ /g, "") === v.replace(/ /g, ""));
    if (!a) throw new Error("No matching appointment found");
    const q = await kioskQueueStatus(a.id);
    if (!q) throw new Error("No matching appointment found");
    return { ...q, date: a.date, time: a.time };
  }
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("kiosk_queue_lookup", { method, value });
  if (error) throw new Error(error.message);
  return data as unknown as KioskQueue & { date?: string; time?: string };
}

/** Clinic kiosk check-in; works without signing in (server function). */
export async function kioskCheckIn(method: "appointmentId" | "phone", value: string): Promise<{ id: string; appointment?: Appointment }> {
  if (!SB) { const a = checkIn(method, value); return { id: a.id, appointment: a }; }
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("kiosk_check_in_tracking", { method, value });
  if (error) throw new Error(error.message);
  const id = data as string;
  await hydrate(state.sessionUserId);
  return { id, appointment: state.appointments.find((x) => x.id === id) };
}

export function markWaiting(id: string) {
  patchAppt(id, { status: "Waiting" });
}

/** Doctor calls the next patient (clinic → In Consultation; online → Ready to Join). */
/** True once the appointment's booked clinic time (Asia/Karachi) has arrived. */
export function appointmentTimeReached(a: { date: string; time?: string }, today = todayStr(), nowMin = clinicMinutesNow()): boolean {
  if (a.date !== today) return a.date < today;
  return !a.time || timeMinutes(a.time) <= nowMin;
}

export function callPatient(id: string) {
  const a = state.appointments.find((x) => x.id === id);
  if (!a) return;
  if (a.date < todayStr()) throw new Error("This appointment has ended");
  if (!appointmentTimeReached(a)) throw new Error(`This appointment starts at ${fmtTime(a.time)}. You can attend it only at its time.`);
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
function renumberAfterReturn(doctorId: string, date: string, returnedId: string, clinicId?: string) {
  const day = state.appointments.filter((x) => x.doctorId === doctorId && sameClinic(x, { clinicId }) && x.date === date);
  const active = day.filter((x) => ["Confirmed", "Pending", "Waiting", "Checked-In"].includes(x.status)).sort((x, y) => queueKey(x) - queueKey(y));
  const returned = active.find((x) => x.id === returnedId);
  if (!returned) return;
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
  const list = waitingQueue(dayAppointments(a.doctorId, a.date, state, a.clinicId)).filter((x) => x.id !== id);
  patchAppt(id, { status: "Waiting", queueOrder: keyAt(list, position) });
  if (!SB) renumberAfterReturn(a.doctorId, a.date, id, a.clinicId);
  const ahead = Math.max(0, Math.min(position, list.length));
  notify(a.patientId, "You're back in the queue", ahead === 0 ? "You are next in line." : `${ahead} patient${ahead > 1 ? "s" : ""} ahead of you.`, `/patient/appointments/${id}`);
}

/** Move a waiting patient up (-1) or down (+1) in the queue. */
export function moveInQueue(id: string, dir: -1 | 1) {
  const a = state.appointments.find((x) => x.id === id);
  if (!a) return;
  const list = waitingQueue(dayAppointments(a.doctorId, a.date, state, a.clinicId));
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  const rest = list.filter((x) => x.id !== id);
  patchAppt(id, { queueOrder: keyAt(rest, j) });
}

export function canJoin(a: Appointment) {
  if (a.type !== "online" || a.date < todayStr()) return false;
  if (a.status === "Ready to Join" || a.status === "In Consultation") return true;
  if (!["Confirmed", "Waiting"].includes(a.status)) return false;
  const diff = (slotDateTime(a).getTime() - Date.now()) / 60000;
  return diff <= state.settings.joinWindowMinutes && diff > -60;
}

// ---------- Consultations ----------
/** Save doctor attachments immediately, including for completed consultations. */
export async function addConsultationDocs(appointmentId: string, docs: DocFile[]): Promise<Consultation> {
  const a = consultationAppointment(appointmentId);
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
  const a = consultationAppointment(appointmentId);
  if (!a) throw new Error("Appointment not found");
  const c: Consultation = { appointmentId, doctorId: a.doctorId, patientId: a.patientId, symptoms: a.reason, diagnosis: "", privateNotes: "", summary: "", prescription: [], documents: [], followUpRequired: false, followUpTiming: "" };
  state = { ...state, consultations: [...state.consultations, c] };
  emit();
  return c;
}
export function saveConsultation(appointmentId: string, p: Partial<Consultation>) {
  ensureConsultation(appointmentId);
  set((s) => ({ ...s, consultations: s.consultations.map((c) => (c.appointmentId === appointmentId ? { ...c, ...p } : c)) }));
}
export async function persistConsultation(appointmentId: string, patch: Partial<Consultation>) {
  const a = consultationAppointment(appointmentId);
  if (!a || a.doctorId !== state.sessionUserId) throw new Error('Only the treating doctor can save this visit');
  const c = { ...ensureConsultation(appointmentId), ...patch, appointmentId, doctorId:a.doctorId, patientId:a.patientId };
  if (SB) {
    const table=TABLES.find(t=>t.key==='consultations');if(!table)throw new Error('Consultation saving unavailable');
    await uploadDocs(c,appointmentId,true);
    const {supabase}=await import('./supabase');const {error}=await supabase.from('consultations').upsert(table.row(c));if(error)throw new Error(error.message);
  }
  state={...state,consultations:[...state.consultations.filter(x=>x.appointmentId!==appointmentId),c]};emit();return c;
}
export async function completeConsultation(appointmentId: string, p: Partial<Consultation>) {
  if (SB) await persistConsultation(appointmentId, { ...p, completedAt: now() });
  else saveConsultation(appointmentId, { ...p, completedAt: now() });
  const a = consultationAppointment(appointmentId);
  if (!a) throw new Error("Appointment not found");
  if (state.volunteerBookings.some(b=>b.id===appointmentId)) await setVolunteerBookingStatus(appointmentId,"Attended");
  else patchAppt(appointmentId, { status: "Completed" });
  const c = state.consultations.find((x) => x.appointmentId === appointmentId);
  if (!c) throw new Error('Consultation not found');
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
  const visits=[...state.appointments,...state.volunteerBookings.map(b=>consultationAppointment(b.id)).filter((a):a is Appointment=>!!a)];
  const mine = visits.filter((a) => a.patientId === userId && ["Confirmed", "Waiting"].includes(a.status));
  mine.forEach((a) => {
    const mins = (slotDateTime(a).getTime() - Date.now()) / 60000;
    const key = (k: string) => state.notifications.some((n) => n.userId === userId && n.title === k && n.body.includes(a.id));
    if (mins > 0 && mins <= 24 * 60 && !key("Appointment reminder")) notify(userId, "Appointment reminder", `${trackingNumber(a)} with ${userById(a.doctorId)?.name} on ${a.date} at ${fmtTime(a.time)}.`, (a.id.startsWith("VB") ? "/patient/free-checkups" : `/patient/appointments/${a.id}`));
    if (mins > 0 && mins <= 60 && !key("Starting soon")) notify(userId, "Starting soon", `${trackingNumber(a)} begins at ${fmtTime(a.time)}. ${a.type === "online" ? "Join from your dashboard." : "Please arrive and check in."}`, a.id.startsWith("VB") ? "/patient/free-checkups" : `/patient/appointments/${a.id}`);
  });
}

/** In-app + browser alert when a prescribed dose time arrives. */
export async function runMedicineReminders(userId: string) {
  const alerts = await loadCareItems();
  const now = new Date();
  state.consultations.filter((c) => c.patientId === userId && c.completedAt && c.prescription?.length).forEach((c) => {
    dueDoses(c.prescription.map((r,i)=>{const override=alerts.find(x=>x.ownerId===userId&&x.kind==="consent"&&x.data.alertAppointment===c.appointmentId&&Number(x.data.alertIndex)===i);return override?{...r,times:String(override.data.alertTimes??"").split(",").filter(Boolean)}:r;}), c.completedAt ?? now.toISOString(), now).forEach(({ key, item, time }) => {
      const tag = `[${c.appointmentId}|${key}]`;
      if (state.notifications.some((n) => n.userId === userId && n.title === "Medicine time" && n.body.includes(tag))) return;
      const body = `Time to take ${item.medicine} — ${item.dosage || "as prescribed"} (${fmtTime(time)}).${item.instructions ? " " + item.instructions : ""} ${tag}`;
      notify(userId, "Medicine time", body, "/patient/records");
      try {
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") new Notification("Medicine time", { body: body.replace(tag, "").trim() });
      } catch { /* browser alert optional */ }
    });
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
export type CallRecording = { id: string; appointmentId: string; uploaderId: string; role: string; url: string; downloadUrl: string; startedAt: string; expiresAt: string };

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
  const { error: metadataError } = await supabase.from("call_recordings").insert({ appointment_id: appointmentId, uploader_id: uid, role, path, started_at: startedAt });
  if (metadataError) throw new Error(metadataError.message);
}

export async function listCallRecordings(appointmentId: string): Promise<CallRecording[]> {
  if (!SB) return [];
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.from("call_recordings").select("*").eq("appointment_id", appointmentId).order("started_at");
  if (error) throw new Error(error.message);
  const out: CallRecording[] = [];
  for (const r of data ?? []) {
    const seconds = Math.min(3600, Math.floor((new Date(r.expires_at).getTime() - Date.now()) / 1000));
    if (seconds <= 0) continue;
    const { data: s, error: urlError } = await supabase.storage.from("recordings").createSignedUrl(r.path, seconds);
    if (urlError) throw urlError;
    const { data: download, error: downloadError } = await supabase.storage.from("recordings").createSignedUrl(r.path, seconds, { download: r.path.split('/').pop() ?? 'recording.webm' });
    if (downloadError) throw downloadError;
    out.push({ id: r.id, appointmentId: r.appointment_id, uploaderId: r.uploader_id, role: r.role, url: s?.signedUrl ?? "", downloadUrl: download?.signedUrl ?? "", startedAt: r.started_at, expiresAt: r.expires_at });
  }
  return out;
}

export async function recordedAppointmentIds(): Promise<Set<string>> {
  if (!SB) return new Set();
  const { supabase } = await import("./supabase");
  const { data } = await supabase.from("call_recordings").select("appointment_id");
  return new Set((data ?? []).map((r: { appointment_id: string }) => r.appointment_id));
}

// ---------- Volunteer (free) checkups ----------
const volTable = (k: "volunteerSessions" | "volunteerBookings") => TABLES.find((t) => t.key === k)!;
function commitVol<K extends "volunteerSessions" | "volunteerBookings">(k: K, x: State[K][number]) {
  hydrating = true;
  try { set((s) => { const list = s[k] as { id: string }[]; return { ...s, [k]: list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [x, ...list] }; }); }
  finally { hydrating = false; }
}
async function readBack<T>(k: "volunteerSessions" | "volunteerBookings", id: string, fallback: T): Promise<T> {
  if (!SB) return fallback;
  const { supabase } = await import("./supabase");
  const { data } = await supabase.from(volTable(k).table).select("*").eq("id", id).maybeSingle();
  return data ? (volTable(k).from(data) as T) : fallback;
}
export function volunteerSpotsLeft(v: VolunteerSession, s: State = state) {
  const used = SB && v.booked !== undefined ? v.booked : s.volunteerBookings.filter((b) => b.sessionId === v.id && b.status !== "Cancelled").length;
  return Math.max(0, v.capacity - used);
}
/** Open until its end time passes on the clinic clock (mirrors the database). */
export function isVolunteerSessionUpcoming(v: VolunteerSession, today = todayStr(), nowTime = clinicClock()) {
  return v.status === "Open" && (v.date > today || (v.date === today && v.end > nowTime));
}
function clinicClock(d = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}
export type VolunteerInput = Omit<VolunteerSession, "id" | "doctorId" | "status" | "booked" | "createdAt">;
function checkVolunteerInput(i: VolunteerInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date) || i.date < todayStr()) throw new Error("Choose today or a future date");
  if (!i.start || !i.end || i.end <= i.start) throw new Error("End time must be after start time");
  if (!Number.isInteger(i.capacity) || i.capacity < 1 || i.capacity > 200) throw new Error("Free spots must be between 1 and 200");
  if (i.mode === "clinic" && !i.location?.trim()) throw new Error("Add the clinic address for in-clinic volunteering");
}
export async function saveVolunteerSession(input: VolunteerInput, id?: string) {
  const me = state.users.find((u) => u.id === state.sessionUserId);
  if (!me || me.role !== "doctor") throw new Error("Only doctors can volunteer");
  checkVolunteerInput(input);
  const old = id ? state.volunteerSessions.find((v) => v.id === id) : undefined;
  if (id && (!old || old.doctorId !== me.id)) throw new Error("Session not found");
  const used = old ? old.capacity - volunteerSpotsLeft(old) : 0;
  if (input.capacity < used) throw new Error(`${used} patients already booked — free spots cannot be lower`);
  let v: VolunteerSession = { ...(old ?? { id: uid("VS"), doctorId: me.id, status: "Open" as const, createdAt: now() }), ...input, location: input.location?.trim() || undefined, focus: input.focus?.trim() || undefined, notes: input.notes?.trim() || undefined };
  await writeRow("volunteer_sessions", volTable("volunteerSessions").row(v), !old);
  v = await readBack("volunteerSessions", v.id, v);
  commitVol("volunteerSessions", v);
  if (old) for (const b of state.volunteerBookings.filter((b) => b.sessionId === v.id && b.status === "Booked"))
    await notifyLabAppointment(b.patientId, "Free checkup updated", `${me.name}: ${v.date}, ${fmtTime(v.start)}–${fmtTime(v.end)} · ${v.mode === "online" ? "Online" : v.location}. Token #${b.token ?? "—"}.`, "/patient/free-checkups");
  return v;
}
export async function cancelVolunteerSession(id: string) {
  const v = state.volunteerSessions.find((x) => x.id === id);
  if (!v || v.doctorId !== state.sessionUserId) throw new Error("Session not found");
  const next = { ...v, status: "Cancelled" as const };
  await writeRow("volunteer_sessions", volTable("volunteerSessions").row(next), false);
  commitVol("volunteerSessions", next);
  for (const b of state.volunteerBookings.filter((b) => b.sessionId === id && b.status === "Booked"))
    await notifyLabAppointment(b.patientId, "Free checkup cancelled", `The free checkup on ${v.date} at ${fmtTime(v.start)} was cancelled by the doctor.`, "/patient/free-checkups");
}
export async function bookVolunteer(sessionId: string, reason: string, memberName?: string) {
  const me = state.users.find((u) => u.id === state.sessionUserId);
  if (!me || me.role !== "patient") throw new Error("Sign in as a patient to book a free checkup");
  const v = state.volunteerSessions.find((x) => x.id === sessionId);
  if (!v || !isVolunteerSessionUpcoming(v)) throw new Error("This free checkup session is not open");
  if (!reason.trim()) throw new Error("Tell the doctor the reason for the visit");
  const mine = state.volunteerBookings.filter((b) => b.sessionId === sessionId && b.status !== "Cancelled");
  if (mine.some((b) => b.patientId === me.id)) throw new Error("You already booked this session");
  if (!SB && volunteerSpotsLeft(v) <= 0) throw new Error("All free spots in this session are taken");
  let b: VolunteerBooking = { id: uid("VB"), sessionId, patientId: me.id, memberName, reason: reason.trim().slice(0, 500), status: "Booked", createdAt: now() };
  if (!SB) b.token = Math.max(0, ...state.volunteerBookings.filter((x) => x.sessionId === sessionId).map((x) => x.token ?? 0)) + 1;
  await writeRow("volunteer_bookings", volTable("volunteerBookings").row(b), true);
  b = await readBack("volunteerBookings", b.id, b);
  commitVol("volunteerBookings", b);
  commitVol("volunteerSessions", await readBack("volunteerSessions", v.id, v));
  const doc = state.users.find((u) => u.id === v.doctorId);
  await notifyLabAppointment(me.id, "Free checkup booked", `Token #${b.token} with ${doc?.name ?? "the doctor"} on ${v.date}, ${fmtTime(v.start)} · ${v.mode === "online" ? "Online" : v.location}. Please arrive on time.`, "/patient/free-checkups");
  await notifyLabAppointment(v.doctorId, "New free checkup booking", `Token #${b.token}: ${memberName ?? me.name} for ${v.date}.`, "/doctor/volunteer");
  return b;
}
export async function setVolunteerBookingStatus(id: string, status: VolunteerBooking["status"]) {
  const b = state.volunteerBookings.find((x) => x.id === id);
  if (!b) throw new Error("Booking not found");
  const v = state.volunteerSessions.find((x) => x.id === b.sessionId);
  const me = state.sessionUserId;
  const isDoctor = v?.doctorId === me;
  if (!isDoctor && !(me === b.patientId && status === "Cancelled")) throw new Error("Not allowed");
  const next = { ...b, status };
  await writeRow("volunteer_bookings", volTable("volunteerBookings").row(next), false);
  commitVol("volunteerBookings", next);
  if (v && isDoctor) await notifyLabAppointment(b.patientId, "Free checkup update", `Token #${b.token} — ${status} · ${v.date} · ${fmtTime(v.start)} · ${v.location ?? "Online"}`, "/patient/free-checkups");
  if (v) commitVol("volunteerSessions", await readBack("volunteerSessions", v.id, v));
}

// ---------- Care services: all UI reads/writes stay behind the store ----------
export async function loadCareItems(): Promise<import('./care').CareItem[]> {
  if (!SB) return offlineCare;
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase.from('care_items').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ id: r.id, ownerId: r.owner_id, recipientId: r.recipient_id ?? undefined, kind: r.kind, data: r.data, createdAt: r.created_at }));
}
let offlineCare: import('./care').CareItem[] = [];
export async function saveCareItem(kind: import('./care').CareKind, data: import('./care').CareItem['data'], recipientId?: string, id?: string) {
  const { validateCare } = await import('./care');
  if (kind === 'complaint') recipientId = undefined;
  if (kind === 'credential' && userById(state.sessionUserId ?? '')?.role === 'pharmacy' && !data.documentPath) throw new Error('Certificate document is required');
  validateCare(kind, data);
  const me = state.sessionUserId; if (!me) throw new Error('Sign in first');
  const existing = await loadCareItems();
  if (!id && kind === "favorite") {const saved=existing.find(x=>x.ownerId===me&&x.kind===kind&&x.recipientId===recipientId&&x.data.status!=="Archived");if(saved)return saved;}
  if (!id && kind === "reservation" && existing.some(x=>x.ownerId===me&&x.kind===kind&&x.recipientId===recipientId&&x.data.medicineId===data.medicineId&&x.data.memberId===data.memberId&&!["Cancelled","Archived","Unavailable","Collected"].includes(String(x.data.status)))) throw new Error("This medicine is already reserved");
  const old = id ? existing.find((x) => x.id === id) : undefined;
  const item: import('./care').CareItem = { id: id ?? crypto.randomUUID(), ownerId: old?.ownerId ?? me, recipientId: old?.recipientId ?? recipientId, kind, data, createdAt: old?.createdAt ?? now() };
  if (SB) await writeRow('care_items', { id: item.id, owner_id: item.ownerId, recipient_id: item.recipientId ?? null, kind, data }, !old);
  else offlineCare = [...offlineCare.filter((x) => x.id !== item.id), item];
  careListeners.forEach(fn=>fn());
  return item;
}
const offlineSafety = new Map<string, import('./care').MedicalSafety>();
export async function loadMedicalSafety(patientId: string, memberId = '') {
  const { emptySafety } = await import('./care');
  if (!SB) return offlineSafety.get(`${patientId}:${memberId}`) ?? emptySafety;
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase.from('medical_safety').select('data').eq('patient_id', patientId).eq('member_id', memberId).maybeSingle();
  if (error) throw new Error(error.message);
  return { ...emptySafety, ...(data?.data ?? {}) } as import('./care').MedicalSafety;
}
export async function saveMedicalSafety(memberId: string, data: import('./care').MedicalSafety) {
  const patientId = state.sessionUserId; if (!patientId) throw new Error('Sign in first');
  if (SB) {
    const { supabase } = await import('./supabase');
    const { error } = await supabase.from('medical_safety').upsert({ patient_id: patientId, member_id: memberId, data });
    if (error) throw new Error(error.message);
  } else offlineSafety.set(`${patientId}:${memberId}`, data);
}
export async function loadActivity() {
  if (!SB) return [];
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error(error.message); return data ?? [];
}
export async function setLabProgress(id: string, p: { sampleStage?: string; reviewedBy?: string; criticalNote?: string; criticalAcknowledgedAt?: string }) {
  const o = state.labOrders.find((x) => x.id === id); if (!o) throw new Error('Order not found');
  if (state.sessionUserId !== o.labId && !(state.sessionUserId === o.doctorId && p.criticalAcknowledgedAt && Object.keys(p).length === 1)) throw new Error('Not allowed');
  const next = { ...o, ...p };
  await writeRow('lab_orders', labOrderTable().row(next), false); commitLabOrder(next);
  if (!SB && p.criticalNote) await notifyLabAppointment(o.doctorId, 'Priority lab review required', `${o.tests}: ${p.criticalNote}`, '/doctor/labs');
}
export async function listSecondFactors() { const {supabase}=await import('./supabase');const {data,error}=await supabase.auth.mfa.listFactors();if(error)throw new Error(error.message);return data.totp; }
export async function enrollSecondFactor() {const {supabase}=await import('./supabase');const {data,error}=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:`Sahoolat ${Date.now()}`});if(error)throw new Error(error.message);return {id:data.id,qr:data.totp.qr_code};}
export async function verifySecondFactor(factorId:string,code:string) {const {supabase}=await import('./supabase');const {error}=await supabase.auth.mfa.challengeAndVerify({factorId,code});if(error)throw new Error(error.message);}
export async function recordDocumentAccess(documentId:string,action:'Preview'|'Download'){if(!SB)return;const {supabase}=await import('./supabase');const {error}=await supabase.rpc('record_document_access',{document_id:documentId,access_action:action});if(error)throw new Error(error.message);}


// Free visits share the consultation record without entering paid clinic queues.
export function consultationAppointment(id:string,s:State=state):Appointment|undefined {
 const paid=s.appointments.find(a=>a.id===id);if(paid)return paid;
 const b=s.volunteerBookings.find(b=>b.id===id);const v=s.volunteerSessions.find(v=>v.id===b?.sessionId);if(!b||!v)return;
 const statuses:Record<VolunteerBooking['status'],AppointmentStatus>={Booked:'Confirmed','In Consultation':'In Consultation',Attended:'Completed',Missed:'No Show',Cancelled:'Cancelled'};
 return {id:b.id,doctorId:v.doctorId,patientId:b.patientId,memberName:b.memberName,type:v.mode,date:v.date,time:v.start,reason:b.reason,status:statuses[b.status],queueNumber:b.token??0,documents:[],createdAt:b.createdAt,clinicName:v.location,clinicAddress:v.location,payment:'cash'};
}
export async function callVolunteerPatient(id:string){const a=consultationAppointment(id);if(!a||a.doctorId!==state.sessionUserId)throw new Error('Visit not found');await setVolunteerBookingStatus(id,'In Consultation');ensureConsultation(id);await notifyLabAppointment(a.patientId,"It's your turn",`Token #${a.queueNumber}: ${userById(a.doctorId)?.name} is ready.`, '/patient/free-checkups');}
const careListeners=new Set<()=>void>();
export function useCareItems(){const [items,setItems]=useState<import('./care').CareItem[]>([]);const user=useSession();useEffect(()=>{let active=true;const refresh=()=>{void loadCareItems().then(xs=>{if(active)setItems(xs);}).catch(()=>{});};refresh();careListeners.add(refresh);return()=>{active=false;careListeners.delete(refresh);};},[user?.id]);return items;}
export async function setPrescriptionAlerts(appointmentId:string,index:number,times:string[]){const c=state.consultations.find(c=>c.appointmentId===appointmentId&&c.patientId===state.sessionUserId);if(!c||!c.prescription[index])throw new Error('Prescription not found');if(times.some(t=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))throw new Error('Invalid alert time');const existing=(await loadCareItems()).find(x=>x.ownerId===state.sessionUserId&&x.kind==='consent'&&x.data.alertAppointment===appointmentId&&Number(x.data.alertIndex)===index);return saveCareItem('consent',{title:'Medicine alerts',details:'Personal dose times',status:'Saved',alertAppointment:appointmentId,alertIndex:index,alertTimes:[...new Set(times)].sort().join(',')},undefined,existing?.id);}
const offlineSearches=new Map<string,number>();
export async function recordMedicineSearch(query:string){const term=query.trim().toLowerCase().slice(0,80);if(term.length<2)return;if(!SB){offlineSearches.set(term,(offlineSearches.get(term)??0)+1);return;}const {supabase}=await import('./supabase');const {error}=await supabase.rpc('record_medicine_search',{term});if(error)throw error;}
export async function popularMedicineSearches():Promise<string[]>{if(!SB)return [...offlineSearches].sort((a,b)=>b[1]-a[1]).slice(0,8).map(x=>x[0]);const {supabase}=await import('./supabase');const {data,error}=await supabase.rpc('popular_medicine_searches');if(error)throw error;return (data??[]).map((r:{term:string})=>r.term);}
