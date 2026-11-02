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
- Role areas are layout routes (`/patient`, `/doctor`, `/admin`, `/pharmacy`) wrapped in `AppShell`, which guards by session role. Why: one shell + nav per role.
- Video calls serialize SDP/ICE through `src/lib/call-peer.ts` with one deterministic initiator and queued early candidates. Why: repeated greetings must not replace an in-progress connection or discard its network candidates.
- Video calls fetch TURN relay credentials server-side (`src/lib/turn.functions.ts`, Cloudflare keys in secrets) and fall back to free no-account relays (freestun, openrelay). Why: direct peer-to-peer fails on mobile/CGNAT networks.
