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
- All data access goes through `src/lib/store.ts`: an in-memory cache hydrated from the user's self-hosted Supabase (`src/lib/supabase.ts`) and written through by diffing state after each mutation; UI must not mutate state directly. Schema lives in `supabase/schema.sql` (run manually by the user). Why: keeps UI synchronous while backed by Supabase; never enable Lovable Cloud.
- Unit tests (MODE=test) run the store on seed data with Supabase disabled. Why: tests stay offline and deterministic.
- Role areas are layout routes (`/patient`, `/doctor`, `/admin`) wrapped in `AppShell`, which guards by session role. Why: one shell + nav per role.
