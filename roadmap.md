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