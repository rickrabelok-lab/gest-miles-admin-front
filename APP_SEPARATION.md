# App Separation Guide

This monorepo contains independent frontends:

- `apps/admin-app` - administrative backoffice
- `apps/manager-app` - manager operations
- `apps/client-app` - end-user/client experience (when present)

## Non-negotiable boundaries

- Do not import code from another app's `src`.
- Shared logic/components must be moved to `packages/shared`.
- Keep per-app routes, auth context, layouts, and API adapters local to each app.

## Safe change workflow

1. Implement changes in one app at a time.
2. If reuse is needed, extract to `packages/shared` first.
3. Validate boundaries:
   - `npm run check:boundaries`
4. Validate app behavior:
   - `npm run dev:admin` or `npm run dev:manager` (or `dev:client`)
   - run lint/build for impacted app(s)

## Why this prevents regressions

- Layout regressions are contained to the app being changed.
- Auth and role logic stay isolated per product surface.
- Shared code is versioned in one place, reducing hidden coupling.
