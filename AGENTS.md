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
- All data access goes through `src/lib/store.ts` (cache hydrated from `src/lib/supabase.ts`, write-through after mutations); UI never mutates state. Exception: public feed/forum uses `src/lib/feed.ts` with react-query. Why: backend-swappable, and feed must work signed-out.
- Backend is Lovable Cloud temporarily; user moves back to self-hosted Supabase. Keep schema plain SQL mirrored in `supabase/schema.sql` + `supabase/limits.sql`; only swap `src/lib/supabase.ts`. Why: one-file switch.
- Unit tests (MODE=test) run the store on seed data, backend disabled. Why: offline, deterministic.
- Role areas are layout routes wrapped in `AppShell`, guarded by session role. Why: one shell per role.
- Booking/rescheduling are awaited; PostgreSQL serializes allocation on the availability row and assigns queue numbers/times; past times refused in both. Why: capacity holds across devices.
- Booking uses Asia/Karachi wall-clock time in browser and database. Why: device timezone must not offer past clinic times.
- Availability: weekly shift arrays, per-shift capacity, date overrides first; legacy fields fallback. Why: no appointments during breaks.
- Tracking numbers use a DB sequence; past active appointments derive Expired at hydration. Why: unique numbers, history kept without jobs.
- Volunteer checkups are separate session/booking rows; DB locks session to cap spots/tokens; they resolve to virtual visits for the consultation console. Why: never mix with paid queues.
- Reception accounts are created only by the doctor's server function; access limited by DB policies. Walk-in messages go to a pending outbox. Why: no self-granted staff roles.
- Lab orders need a prescribing appointment only for catalogue tests the lab marks `prescriptionRequired` (DB `lab_tests_need_rx`); otherwise patients self-book with empty doctor/appointment ids. Results under `lab/<orderId>/` are permanent. Lab catalogues live in lab JSON with validated entries; lab schedules use shared helpers and DB capacity checks. Why: labs decide which tests need prescriptions, no overbooking.
- Care workflows use store operations over RLS-protected records; audits are DB triggers; authorization uses user_roles. Why: don't trust UI roles.
- Reception attendance/day cancellation are RPCs; doctor summaries and doctor-start alerts are SQL schedules. Why: notices must not need an open dashboard.
- Uploads (doctor attachments, call recordings) use awaited storage-and-metadata operations; doctor-side full history needs server-verified PIN. Why: survive refresh, keep gate.
- Video calls embed a VDO.Ninja room per appointment; mic recordings in 2-min segments to private `recordings`, admin-only; expiry DB-assigned and a managed job deletes files. Why: reliable calls, complete case files.
- Feed/forum: `posts`, `post_likes`, `post_comments` are publicly readable, writes need sign-in; author names set by trigger; pictures in private `feed` bucket shown via signed URLs; doctor search ranks by `doctor_reputation()`. Why: public buckets are blocked in this workspace.
- Prices use the shared currency constant and formatter in `src/lib/utils.ts`. Why: consistent display.
- Dashboard nav sits in its own top row, sign-out in the account row and awaits auth teardown. Why: fits every screen.
- Visual style follows the uploaded HealthSahoolat design (green/gold tokens, Poppins, `BrandLogo` header, dark-green top strip). Why: user-chosen brand look; restyle only, never change flows.
- Signed-out visitors may browse patient listing pages (doctors, labs, free checkups, provider pages) via `GuestShell` in AppShell; booking and records stay sign-in only. App images are bundled files in src/assets, not CDN pointers. Why: public browsing and the Vercel deploy.
- Patients never check themselves in; homepage/`/checkin` only look up queue status via `kiosk_queue_lookup`. Arrival is marked by doctor/receptionist. Why: user wants attendance controlled by clinic staff.
- AI symptom search sends patients to `/patient/doctors` filtered by suggested specialities (search params), not an inline pick. Why: user wants the doctors page to show relevant doctors.
- A floating Back button (`BackButton` in `__root.tsx`) shows on every page except `/`. Why: user wants a way back on every page.
- Queue lookup is by tracking number only (no phone). Doctors post blogs/photos/videos from Discussions; "My Feed" nav removed. Authors may edit their own posts (DB trigger keeps author/kind/pictures). Why: user requests.
- Signed-in users never see sign-up links; `/register` shows "already signed in". Why: user request.
