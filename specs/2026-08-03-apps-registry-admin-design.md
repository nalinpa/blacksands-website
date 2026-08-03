# apps-registry-admin — design spec

Date: 2026-08-03 (revised same day — see Revision note)
Status: approved by user, pending write-up as implementation plan

## Revision note

The first version of this spec (approved earlier the same day) called for a
brand-new local Node server that copied `enginev1/api/src/lib/firestore.ts`
and `firestore-admin.ts` verbatim, so a browser UI could avoid touching
Firestore directly. While investigating for the implementation plan,
`enginev1/api/src/routes/adminApps.ts` turned up — a route file, mounted at
`/v1/admin`, with a working `GET /v1/admin/apps` (list) endpoint already
using the exact non-appId-scoped `verifyAdmin` pattern the earlier version of
this spec assumed didn't exist (tested in `enginev1/api/test/admin-apps.test.ts`).
That materially changes the cost of extending the real API vs. building a
parallel local one, so the design below replaces the local-server approach.
The problem statement and the rules-hardening constraint are unchanged; only
"What gets built" is different.

## Problem

The `apps` Firestore collection in the `blacksands-a37aa` project is the
engine's config registry — one doc per white-label app (`cones`, `rings`,
`eats`, `guideakl`, ...), consumed by `blacksands-api`'s `appContext`
middleware (`enginev1/api/src/middleware/appContext.ts`) to resolve every
`/v1/:appId/...` request. Today it's edited by hand in the Firebase console.
The `@blacksands/create-app` design spec
(`enginev1/create-app/docs/superpowers/specs/2026-07-08-blacksands-create-app-design.md`)
flags this explicitly as a known gap: "No self-serve `appId` registration...
Worth a small companion tool on the `blacksands-api` side eventually." This
spec is that companion tool.

What exists today, precisely:
- `GET /v1/admin/apps` (`adminApps.ts`) — lists every doc, but only returns
  `{ appId, name, theme }`, not the full config.
- `PUT /v1/:appId/admin/location-fields` (`admin.ts`) — the only write path
  into `apps/{appId}`, and it only ever touches the `locationFields` field of
  a doc that must already exist.

No route reads one full doc, creates a new one, updates arbitrary fields, or
deletes one. That's the gap this tool closes.

## Constraint: the registry project is mid-hardening

Per prior incident notes (2026-07-29 outage, `blacksands-api` 500'd for 4
days on a Firestore-rules change): the team has already written a
**deny-all** `firestore.rules` for `blacksands-a37aa`
(`enginev1/api/firestore.rules`) — intent is that nothing gets client-facing
Firestore access to this project anymore, everything reads/writes through a
service account (`FIREBASE_SA_REGISTRY`, via `enginev1/api/src/lib/
firestore-admin.ts`). That rules file is written but not yet deployed
(blocked on a permission prompt), so the project is currently still on a
permissive rule left over from the incident.

This still rules out a browser-side Firebase Client SDK talking to Firestore
directly (the pattern `cones/admin` uses for its own project) — it would
break the moment the pending deny-all rules deploy. The design below never
does that: the browser only ever calls `blacksands-api` over HTTPS with an
admin-authenticated Firebase ID token, exactly like `cones/admin` already
does for its own admin writes (`admin.ts` routes) — the service account
itself never leaves the Worker's secret store.

## What gets built

### 1. Backend — extend `enginev1/api/src/routes/adminApps.ts`

Add four routes alongside the existing `GET /apps`, all gated by the same
`verifyAdmin(authHeader, [c.env.FIREBASE_PROJECT_ID])` check already used
there (registry-level admin, not scoped to one app's project):

- `GET /apps/:appId` → `client.getDoc("apps/" + appId)`; 404 if missing.
  Response shape matches the list endpoint's convention:
  `{ appId: <doc id>, ...rest of doc fields }` — the Firestore doc itself
  has no stored `appId` field (confirmed via `registryDoc()` in
  `test/helpers.ts`, which strips it before writing); `appId` is always
  derived from the document ID, never stored redundantly.
- `POST /apps` → body is a full `AppConfig`-shaped JSON object *including*
  `appId`. Server validates, strips `appId` out of the fields before
  writing (so it isn't redundantly stored), and commits to
  `apps/{appId}` with `currentDocument: { exists: false }` — 409 if that
  appId is already registered. Mirrors the create-or-fail pattern
  `admin.ts` already uses for locations.
- `PUT /apps/:appId` → body is a partial `AppConfig` (no `appId` field;
  the URL param is the only source of identity, it's immutable).
  `commit` with `updateMask.fieldPaths = Object.keys(body)` and
  `currentDocument: { exists: true }` — 404 if the appId doesn't exist.
- `DELETE /apps/:appId` → `getDoc` first (404 if missing, so the UI gets a
  clean "not found" instead of a silent no-op), then
  `commit([{ delete: docName(...) }])`.

**Refactor while touching this code:** `LOCATION_FIELD_TYPES`,
`RESERVED_FIELD_KEYS`, and `validateLocationFields` currently live only in
`admin.ts` (used for the `PUT /location-fields` route). `POST /apps` and
`PUT /apps/:appId` need the same validation when a `locationFields` array is
present in the body, so extract those three into a new
`enginev1/api/src/lib/locationFields.ts` and import from both route files.
This removes the only other reasonable place a second, drifting copy of the
10-value type list could get pasted into.

**Validation scope, deliberately not exhaustive:** required on create —
`appId` (existing `validId` shape check from `lib/itinerary.ts`), `name`,
`firebaseProject`, `r2Bucket` (non-empty strings), `collections.locations`
(non-empty string). `locationFields[]` items validated via the shared
validator above when present. `theme`, `map`, `features`,
`collections.{reviews,itineraries}` are accepted as submitted with only a
type check (object/array as appropriate) — Firestore itself is schemaless,
every real consumer of these fields already reads them with optional
chaining or defaults (`cfg.collections.itineraries ?? "itineraries"` in
`admin.ts`), and the form UI (not this API layer) is what constrains their
shape for a human editing them. Exhaustively validating every leaf of a
config object this nested for an internal, single-operator admin tool is
effort spent where the spec-writing skill's own scope-fit rubric says not to.

**No route changes needed elsewhere.** CORS (`middleware/cors.ts`) already
allows `*` origin, `Authorization` header, and all four HTTP methods used
here — nothing to touch.

### 2. Frontend — new `registry-admin/` app in the `blacksands` repo

A small React + Vite + Tailwind app, structurally mirroring `cones/admin`
(same toolchain, same page/component/model split), but talking to
`blacksands-api` (`https://api.blacksands.app`, confirmed live) instead of
Firestore directly, and scoped to the registry rather than one app's
locations:

```
registry-admin/
  package.json / vite.config.ts / index.html / tailwind.config.js / postcss.config.js
  src/
    firebase.ts          — Firebase Auth only (no Firestore import)
    auth/useAdmin.ts      — signs in, then confirms admin by calling
                             GET /v1/admin/apps with the ID token: 200 = admin,
                             401 = signed in but not admin. No Firestore
                             `admins/{uid}` doc lookup (that would need
                             client-facing Firestore access again).
    api/appsClient.ts     — fetch wrapper: listApps, getApp, createApp,
                             updateApp, deleteApp — each attaches
                             `Authorization: Bearer <idToken>`.
    models/appConfig.ts   — TS mirror of `AppConfig`/`LocationFieldSchema`/
                             `CompletionConfig` from `enginev1/api/src/types.ts`
                             (separate repos, so this is a copy, not an import —
                             same tradeoff already accepted for the
                             `LOCATION_FIELD_TYPES` list on the backend side)
    pages/LoginPage.tsx, AppsPage.tsx
    components/apps/
      ThemeEditor.tsx           — key/value row editor, arbitrary keys
      FeaturesEditor.tsx        — completion/itinerary/push/redemption
      LocationFieldsEditor.tsx  — array editor, same shape as
                                   cones/admin's CheckpointsEditor.tsx
      AppForm.tsx               — composes the above + the scalar fields
```

**Firebase config** (already exists — a web app named "appregistry" was
already registered under `blacksands-a37aa`, fetched via
`firebase apps:sdkconfig web`):

```ts
const firebaseConfig = {
  apiKey: "AIzaSyC3RqOh9GBn-Pl_S2NVobHaUwaQdtap9Mo",
  authDomain: "blacksands-a37aa.firebaseapp.com",
  projectId: "blacksands-a37aa",
  storageBucket: "blacksands-a37aa.firebasestorage.app",
  messagingSenderId: "380028594691",
  appId: "1:380028594691:web:af4e8e3df7ad54bdcbbc36",
};
```

A Firebase Web API key is not a secret (same reasoning `cones/admin` already
applies — it's meant to ship in client bundles; access is controlled by Auth
+ rules, not by hiding the key), so this is committed plainly, same as
`cones/admin/src/firebase.ts`.

**Precondition (not built by this tool):** the operator's own account must
already carry the `admin: true` custom claim on the `blacksands-a37aa`
project. `enginev1/api/scripts/grant-admin.mjs` already does this
(`GOOGLE_APPLICATION_CREDENTIALS=./blacksands-service-account.json node
scripts/grant-admin.mjs you@example.com`) — out of scope to rebuild.

### Form fields

| AppConfig field | control |
|---|---|
| `appId` | text, disabled after create |
| `name`, `firebaseProject`, `r2Bucket` | text |
| `collections.locations` | text, required |
| `collections.reviews`, `collections.itineraries` | text, optional |
| `theme` | dynamic key/value row editor (add/remove rows; arbitrary keys) |
| `map.center` | two number inputs (lat, lng) |
| `features.completion` | toggle; when on, reveals `collection` (text), `methods` (checkboxes: tick/checkin), `checkin.gateRadius` (number, only if `checkin` method checked), `fields.locationId/locationSlug/locationName/shared` (text × 4) |
| `features.itinerary.enabled`, `features.push.enabled`, `features.redemption.enabled` | toggles |
| `locationFields` | array editor: `key`, `label`, `type` (select, 10 options), `required` (checkbox), `options` (comma-separated, shown only when `type` is `select`/`multiselect`) |

After every successful save, the UI shows: "Saved. Live API may take up to
5 min to pick this up (KV cache TTL)." No auto-invalidation is attempted —
unlike the old local-server design, this version *could* technically add a
cache-bust call, but no route for it exists yet (`admin.ts`'s
`location-fields` route busts the cache for its own field only); adding one
generically is a reasonable future addition, explicitly not this plan.

## Explicitly out of scope

- Building a local server or copying `firestore.ts`/`firestore-admin.ts` —
  superseded by extending the real API (see Revision note).
- A general `APP_CONFIG` KV cache-bust route — noted above, not built here.
- Provisioning a new Firebase project / per-app service account for a brand
  new client app — this tool only edits the registry doc, same boundary
  `create-app`'s spec already drew.
- Rebuilding `grant-admin.mjs` or any user/account-provisioning flow.

## Error handling

- 404 from `GET /apps/:appId` on an unknown id → UI shows "not found."
- 409 from `POST /apps` on a duplicate `appId` → UI shows "appId already
  registered."
- 401 from any route (expired token, non-admin) → UI drops back to the
  login screen.
- Any other non-2xx → server responds `{ ok: false, error }` (existing
  convention throughout `enginev1/api`); UI surfaces `error` inline, same
  pattern `ConesPage.tsx` uses (`setMsg(...)`).

## Testing

**Backend:** real TDD, using the existing harness
(`enginev1/api/test/helpers.ts`: `makeEnv`, `mockFetch`, `registryDoc`,
`makeKeypair`/`signToken` for admin tokens) — same pattern
`admin-apps.test.ts` already uses for the `GET /apps` route. New tests added
to that same file for each of the four new routes: 401 without a valid admin
token (already covered once and shared across routes in spirit, but each
route needs its own since they're separate handlers), 404/409 branches, and
a success case per route asserting the exact Firestore REST call shape
(`commit` body, `updateMask`, etc.) via the mock's recorded calls.

**Frontend:** manual only — this is a small, single-operator admin UI, and
its logic is presentation/wiring rather than branchy business logic (the
branchy logic — create-or-fail, update-or-404, validation — all lives
server-side and is covered by the tests above). Smoke test: log in, create a
throwaway appId, edit each field type once (including the `locationFields`
array and `theme` map), delete it, confirm all four ops against
`blacksands-api` by re-reading via the existing
`blacksands/scripts/firebase-collection-to-json.js` script.
