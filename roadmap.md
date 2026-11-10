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
