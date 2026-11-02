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
- All data access goes through `src/lib/store.ts`: an in-memory cache hydrated from the backend client exported by `src/lib/supabase.ts` and written through by diffing state after each mutation; UI must not mutate state directly. Why: keeps UI synchronous and backend-swappable.
- Backend is Lovable Cloud temporarily for testing; the user plans to move back to self-hosted Supabase. Keep schema portable (plain SQL, mirrored in `supabase/schema.sql` + `supabase/limits.sql`) and only swap `src/lib/supabase.ts` when moving. Why: one-file switch back.
- Unit tests (MODE=test) run the store on seed data with the backend disabled. Why: tests stay offline and deterministic.
- Booking and rescheduling go through the store's awaited write-through operation; PostgreSQL serializes allocation on the doctor's availability row and assigns stable queue numbers and times. Why: concurrent devices must obey daily capacity and receive the committed booking, not an optimistic estimate.
- Booking availability uses Africa/Tripoli wall-clock time in both browser and database. Why: device timezone must not offer already-past clinic times.
- Availability supports weekly shift arrays with per-shift capacity and date overrides; empty arrays mean days off, legacy fields are a fallback only. Browser schedule helpers and SQL allocation must resolve overrides first and enforce both shift and day totals. Why: split clinic visits must never create appointments during breaks.
- Role areas are layout routes (`/patient`, `/doctor`, `/admin`, `/pharmacy`) wrapped in `AppShell`, which guards by session role. Why: one shell + nav per role.

- Video consultations embed a VDO.Ninja room derived from the appointment ID (no custom WebRTC); each participant records their own mic in 2-minute segments to the private `recordings` bucket + `call_recordings` table, readable only by admins via `/admin/cases`. Why: free relays were unreliable, and admins need a complete case file.