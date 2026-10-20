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
- All data access goes through `src/lib/store.ts` (in-memory mock); its exported functions are the API surface to swap for the user's self-hosted Supabase later — UI must not mutate state directly. Why: frontend-first build, backend to be connected later; do not enable Lovable Cloud.
- Role areas are layout routes (`/patient`, `/doctor`, `/admin`) wrapped in `AppShell`, which guards by session role. Why: one shell + nav per role.
