# Clinic controls and doctor alerts
- [x] Require laboratory test name, positive PKR price, details and report turnaround; 10 tests passed, signed-in lab save/reload verified at desktop/mobile, QA lab removed.
- [x] Add permission-checked receptionist arrival/absent actions; both saved after refresh and mobile checked.
- [x] Cancel a selected day's remaining appointments atomically with required reason and patient notifications; two saved cancellations and notices verified.
- [x] Save doctor daily stats time/WhatsApp number and queue daily summaries and discussion alerts; settings saved after refresh, summary deduplication checked.
- [x] Ten tests passed; signed-in doctor/reception flows had no browser errors.
- [ ] WhatsApp sending and verified delivery of stats/discussion notices — waiting for WhatsApp Business connection and approved templates.

# Lab appointment scheduling
- [x] Add laboratory weekly hours, split shifts, date overrides and slot capacity.
- [x] Require available date/time for patient and doctor bookings; allow labs to schedule older untimed requests.
- [x] Enforce booking capacity in the database; 15 tests passed. Lab dashboard to availability save/refresh, two patient bookings, lab rescheduling and received patient alerts verified at desktop/mobile with light/dark classes. Saved notifications are awaited; full slot excluded. Temporary test data removed.

# Tracking numbers and past appointments
- [x] Use numeric tracking numbers for existing and new doctor/lab appointments, including check-in; saved patient tracking verified in browser.
- [x] Close past active doctor appointments and unattended lab bookings while preserving medical history; 18 tests passed. Numeric items verified at 390/1280 in light and dark; browser expiry display not verified.

# Dashboard sign-out and page transitions
- [x] Guard incomplete doctor sessions/profiles, remove stale photo errors, and preload menu pages; signed-in doctor navigation and availability tabs verified without errors (6 tests passed).
- [x] Keep Sign out visible on every dashboard at all screen sizes.
- [x] Fix stale hydration overwrites and consultation initialization; show loading during automatic page-update recovery.
- [x] Verify patient page navigation and live sign-out at 390, 949 and 1280 pixels; no browser errors, 8 relevant tests passed.

# Doctor documents and patient history
- [x] Save doctor document uploads immediately, including after completed visits.
- [x] Gate the full patient history with the patient's PIN and refresh unlocked records.
- [x] Test doctor uploads and PIN-protected history (7 relevant tests passed).
- [ ] Verify live upload and PIN unlock with a doctor appointment; current preview session provides no doctor account.

# Queue-based appointments
- [x] Add daily patient capacity and automatic queue/time allocation with server enforcement.
- [x] Replace patient time selection in booking, doctor profile and rescheduling.
- [x] Add dashboard capacity control and align availability settings.
- [x] Verify allocation rules and signed-in booking flow (23 tests passed; saved booking read back after refresh, then test booking cancelled).

# Customizable doctor schedules
- [x] Add multiple shifts per weekday and date-specific schedule overrides.
- [x] Enforce shift hours and patient limits in automatic booking and the database.
- [x] Update doctor schedule editor, dashboard limit and patient schedule display.
- [x] Test split shifts, overrides, limits and schedule saving (30 tests passed; doctor saved two shifts and read them back after refresh; test override removed).
- [ ] WhatsApp delivery: send booking, leave-now, break and reception walk-in messages (pending outbox) — waiting for user to connect WhatsApp Business
