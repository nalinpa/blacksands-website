# apps-registry-admin — design spec

Date: 2026-08-03
Status: approved by user, pending write-up as implementation plan

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

The only existing write path from any admin surface into `apps/{appId}` is
`PUT /v1/:appId/admin/location-fields` (`enginev1/api/src/routes/admin.ts`),
which only ever touches the `locationFields` field of a doc that must already
exist. Full CRUD on the registry (create a new appId, edit any field, list,
delete) doesn't exist anywhere.

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

This rules out a browser-side Firebase Client SDK approach (the pattern
`cones/admin` uses) — it would either break the moment the pending deny-all
rules deploy, or require carving a new client-facing hole back open in the
exact surface just closed. This tool instead runs a small **local-only**
server that holds the service account and proxies Firestore writes; the
browser never talks to Firestore directly.

## What gets built

A new folder in the `blacksands` repo (the repo `blacksands-a37aa` already
belongs to — same place `scripts/` already holds ad hoc per-project admin
scripts and service-account JSONs): `registry-admin/`.

```
registry-admin/
  server/
    index.ts           — Hono app, port 8787, CRUD routes over `apps`
    firestore.ts        — copied verbatim from enginev1/api/src/lib/firestore.ts
    firestore-admin.ts   — copied verbatim from enginev1/api/src/lib/firestore-admin.ts
    service-account.json — gitignored; copy of enginev1/api/scripts/blacksands-service-account.json
  web/
    src/
      firebase-less — no firebase package; talks to the local server only
      pages/AppsPage.tsx
      components/apps/AppForm.tsx
      components/apps/ThemeEditor.tsx        — key/value rows
      components/apps/FeaturesEditor.tsx     — completion/itinerary/push/redemption
      components/apps/LocationFieldsEditor.tsx — array editor, same shape as
                                                   cones/admin's CheckpointsEditor.tsx
    (Vite + React + Tailwind, same toolchain as cones/admin, dev server
     proxies /api to the local server on 8787)
  package.json          — root scripts: `npm run dev` runs server + vite
                           concurrently
```

### Server: routes over `apps`

Reuses `getFirestoreAdmin(env, projectId)` from the copied
`firestore-admin.ts` exactly as `enginev1/api/src/routes/admin.ts` already
does for locations — same `commit`/`getDoc`/`query`/`encode`/`docName`
helpers, same Firestore REST wire format, so nothing about how a doc is
shaped can drift from what the production Worker reads.

- `GET /api/apps` → `client.query("apps")`, no filter — full registry list.
- `GET /api/apps/:appId` → `client.getDoc("apps/" + appId)`, 404 if missing.
- `POST /api/apps` → body is a full `AppConfig`; `commit` with
  `currentDocument: { exists: false }` (409 if the appId is already taken —
  mirrors the create-or-fail pattern `admin.ts` uses for locations).
- `PUT /api/apps/:appId` → body is a partial `AppConfig`; `commit` with
  `updateMask.fieldPaths = Object.keys(body)` and
  `currentDocument: { exists: true }` (404 if the appId doesn't exist).
- `DELETE /api/apps/:appId` → `commit([{ delete: docName(...) }])`.

`env` for `getFirestoreAdmin` is `{ FIREBASE_PROJECT_ID: "blacksands-a37aa",
FIREBASE_SA_REGISTRY: <contents of service-account.json> }`, loaded from
`.env` at startup (`dotenv`) — same variable names the Worker uses, so
there's no new naming convention to remember.

Server-side validation before every write:
- `appId`: same `validId` shape check pattern used elsewhere
  (`enginev1/api/src/lib/itinerary.ts`), immutable after create.
- `locationFields[].type` restricted to the same 10-value set
  `admin.ts`'s `validateLocationFields` already enforces (`text`,
  `textarea`, `number`, `coords`, `images`, `select`, `boolean`, `image`,
  `checkpoints`, `multiselect`) — kept as a literal constant here, not
  imported cross-repo, since `blacksands` and `enginev1` are separate repos.

No auth layer on the server. Trust boundary is "this only listens on
localhost, on your machine" — matches how the tool is actually used, and
matches the general steer toward not building unrequested abstractions.

### Frontend: form fields

One page, mirroring `cones/admin`'s `ConesPage.tsx` shape (list + selectable
form, `onSnapshot`-style live list swapped for a plain fetch-on-load /
refetch-after-save since there's no Firestore listener available through a
plain REST proxy):

| AppConfig field | control |
|---|---|
| `appId` | text, disabled after create |
| `name`, `firebaseProject`, `r2Bucket` | text |
| `collections.locations` | text, required |
| `collections.reviews`, `collections.itineraries` | text, optional |
| `theme` | dynamic key/value row editor (add/remove rows; arbitrary keys, not a fixed list — matches how the map(map) shape varies per app in the real examples pulled from the console) |
| `map.center` | two number inputs (lat, lng) |
| `features.completion` | toggle; when on, reveals `collection` (text), `methods` (checkboxes: tick/checkin), `checkin.gateRadius` (number, only if `checkin` method checked), `fields.locationId/locationSlug/locationName/shared` (text × 4) |
| `features.itinerary.enabled`, `features.push.enabled`, `features.redemption.enabled` | toggles |
| `locationFields` | array editor: `key`, `label`, `type` (select, 10 options), `required` (checkbox), `options` (comma-separated, shown only when `type` is `select`/`multiselect`) — structurally the same as `CheckpointsEditor.tsx` |

After every successful save, the UI shows: "Saved. Live API may take up to
5 min to pick this up (KV cache TTL) — no path from this tool into that
cache." No auto-invalidation is attempted; there's no route from a local
Node script into Cloudflare KV for the Worker's `APP_CONFIG` binding.

## Explicitly out of scope

- Any auth/login screen.
- Deploying this anywhere — local dev tool only, `npm run dev`.
- Changes to `blacksands-api` itself (no new Worker routes).
- Busting the Worker's `APP_CONFIG` KV cache after a write.
- Provisioning a new Firebase project / per-app service account for a brand
  new client app — this tool only edits the registry doc, same boundary
  `create-app`'s spec already drew.

## Error handling

- 404 from `GET /api/apps/:appId` on an unknown id → UI shows "not found",
  no crash.
- 409 from `POST /api/apps` on a duplicate `appId` → UI shows "appId already
  registered."
- Any Firestore REST failure (`FirestoreAdminError`) → server responds
  `{ ok: false, error }` with the upstream status code; UI surfaces the
  message inline, same pattern `ConesPage.tsx` uses (`setMsg(e.message)`).

## Testing

Manual only — this is a local admin tool with one operator. Smoke test:
create a throwaway appId, edit each field type once (including the
`locationFields` array and `theme` map), delete it, confirm all four ops hit
Firestore correctly by re-reading via the existing
`blacksands/scripts/firebase-collection-to-json.js` script.
