<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Recording expiry is database-assigned; a managed authenticated job deletes expired files through Storage API before metadata, and signed links cannot outlive expiry. Why: retention survives closed dashboards without deleting case history.
- Extended care workflows use store-owned operations over RLS-protected care and medical-safety records; audit trails are database-triggered and authorization uses user_roles. Why: private family information and provider review decisions must survive refresh without trusting UI roles.
- Laboratory test catalogues live in the existing lab JSON data, with validated structured entries and a names-only search fallback; details saves are awaited. Why: required pricing/details persist without losing legacy listings or changing schedules.
- Reception attendance and whole-day cancellation use authenticated database RPCs through the store; doctor summaries use private settings and daily SQL schedules, with discussion messages queued by insert triggers. Why: permission checks and durable notices must not depend on an open dashboard or WhatsApp being connected.
- Patient call uploads require successful content-based naming and use the store's awaited storage-and-metadata operation; report inference uses the AI Gateway SDK inside its authenticated server function. Why: original filenames and premature upload success must not silently replace report reading or persistence.
- Doctor pages narrow session and profile data before rendering; navigation preloads on intent, and shared avatars fall back for persisted blob URLs or failed images. Why: transient data and stale tab-local photos must not crash or slow dashboard transitions.
- Monetary displays and input currency labels use the shared currency constant and price formatter in `src/lib/utils.ts`. Why: prices stay consistent across booking and medicine views without altering stored amounts.
- Dashboard headers keep navigation in a separate top row and sign-out in the shared account row; sign-out awaits auth teardown and invalidates pending hydrations. Why: account controls must fit every screen and stale refreshes must not restore signed-out data.
- Doctor attachments use the store's awaited upload-and-save operation; full doctor-side patient history is rendered only after server-verified PIN access. Why: uploads must survive refresh and history must not bypass its gate.
- All data access goes through `src/lib/store.ts`: an in-memory cache hydrated from the backend client exported by `src/lib/supabase.ts` and written through by diffing state after each mutation; UI must not mutate state directly. Why: keeps UI synchronous and backend-swappable.
- Backend is Lovable Cloud temporarily for testing; the user plans to move back to self-hosted Supabase. Keep schema portable (plain SQL, mirrored in `supabase/schema.sql` + `supabase/limits.sql`) and only swap `src/lib/supabase.ts` when moving. Why: one-file switch back.
- Unit tests (MODE=test) run the store on seed data with the backend disabled. Why: tests stay offline and deterministic.
- Booking and rescheduling go through the store's awaited write-through operation; PostgreSQL serializes allocation on the doctor's availability row and assigns stable queue numbers and times. Why: concurrent devices must obey daily capacity and receive the committed booking, not an optimistic estimate.
- Booking availability uses Africa/Tripoli wall-clock time in both browser and database. Why: device timezone must not offer already-past clinic times.
- Availability supports weekly shift arrays with per-shift capacity and date overrides; empty arrays mean days off, legacy fields are a fallback only. Browser schedule helpers and SQL allocation must resolve overrides first and enforce both shift and day totals. Why: split clinic visits must never create appointments during breaks.
- Role areas are layout routes (`/patient`, `/doctor`, `/admin`, `/pharmacy`) wrapped in `AppShell`, which guards by session role. Why: one shell + nav per role.

- Video consultations embed a VDO.Ninja room derived from the appointment ID (no custom WebRTC); each participant records their own mic in 2-minute segments to the private `recordings` bucket + `call_recordings` table, readable only by admins via `/admin/cases`. Why: free relays were unreliable, and admins need a complete case file.- Reception accounts are created only by the doctor's authenticated server function (role in app metadata); their access is limited to the linked doctor by database policies and per-account permissions. Messages for people without an account go to a pending outbox for WhatsApp delivery. Why: users must not grant themselves staff roles, and walk-ins have no dashboard.
- Lab test orders always reference a prescribing doctor appointment (doctor-sent or patient-booked against their own prescribed consultation); lab results live on the order under `lab/<orderId>/` storage and the database refuses removal. Why: tests need a prescription and lab reports must be permanent.
- Lab appointments use the shared lab schedule helpers and database-serialized capacity checks; public slot usage exposes counts only, and saved bookings retain their duration when availability changes. Why: patients receive real scheduled times without exposing other patients or overbooking.

- Public tracking numbers use the database sequence; immutable IDs remain for links and files. Past active doctor appointments derive Expired status at hydration using clinic dates, without deleting records. Why: numbering is unique and medical history survives expiration without background jobs.
- Volunteer free checkups are separate session/booking records (not paid appointments); the database locks the session row to cap spots and assign tokens, and maintains the booked count so patients never read others' bookings. Why: free sessions must not interfere with paid queue allocation.

- Free bookings resolve to virtual visits for the shared consultation console, never paid queue rows; searches expose aggregates only. Why: reuse clinical records without mixing queues or revealing searchers.
