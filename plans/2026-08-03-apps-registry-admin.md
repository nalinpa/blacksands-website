# Apps Registry Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the `blacksands-a37aa` `apps` Firestore registry (one config doc per white-label app: `cones`, `rings`, `eats`, `guideakl`, ...) full self-serve CRUD — today it can only be listed and hand-edited in the Firebase console.

**Architecture:** Two repos, one feature. `enginev1/api` (the `blacksands-api` Cloudflare Worker) gets four new routes on the existing `adminApps.ts` router (`GET /apps/:appId`, `POST /apps`, `PUT /apps/:appId`, `DELETE /apps/:appId`), reusing the already-deployed `verifyAdmin`/`getFirestoreAdmin` machinery. `blacksands` gets a new small React/Vite/Tailwind app, `registry-admin/`, that logs in with Firebase Auth and calls those routes over HTTPS — it never touches Firestore directly.

**Tech Stack:** Backend: TypeScript, Hono 4, Cloudflare Workers, `node:test` (via `tsx`). Frontend: React 19, Vite 7, Tailwind 3, `react-router-dom` 7, `firebase` JS SDK (Auth module only).

**Spec:** `blacksands/specs/2026-08-03-apps-registry-admin-design.md`

## Global Constraints

- Node 18+ everywhere (repo convention relies on global `fetch`/`crypto`/`atob`/`btoa`).
- Backend tests run with `npm test` in `enginev1/api` (`tsx --test test/*.test.ts`) — **baseline is 137 passing, 0 failing**, confirmed by running it before this plan was written. Every backend task's test step gives the exact expected count after that task's additions.
- Backend tests never touch real Firestore or real network — they mock `globalThis.fetch` using the existing `enginev1/api/test/helpers.ts` (`mockFetch`, `makeEnv`, `registryDoc`, `fsDoc`, `makeKeypair`, `signToken`, `jwksRoute`). Reuse these; do not invent parallel test infrastructure.
- Frontend testing is manual only (per the approved spec): all branchy/validating logic (required-field checks, create-or-fail, update-or-404, `locationFields` type validation) lives server-side and is covered by the backend tests above. The frontend is presentation and wiring — `cones/admin`, the existing precedent this app is modeled on, has no automated tests either.
- **`enginev1/api` currently has pre-existing, unrelated, uncommitted changes** (`git status` at plan-writing time: modified `src/index.ts`, `src/lib/cache.ts`, `src/lib/telegram.ts`, `src/routes/adminApps.ts`, `test/admin-apps.test.ts`, `test/config.test.ts`, `test/helpers.ts`, `wrangler.toml`; untracked `firebase.json`, `firestore.rules`) — this is the registry-hardening work described in project memory, not yet deployed. **Never run `git add -A` or `git add .` in that repo.** Every commit step below lists the exact files to stage. **Do not run `wrangler deploy`** as an unattended step — the last backend task ends with a note to confirm with the user first, since a deploy would ship those unrelated pending changes too, not just this feature's routes.
- No new backend dependencies. No `firebase-admin` npm package anywhere (the whole point of reusing `firestore-admin.ts` is avoiding it). Frontend adds `firebase`, `react`, `react-dom`, `react-router-dom` + the same Vite/Tailwind dev toolchain `cones/admin` already uses — nothing else.
- `appId` format everywhere: `/^[A-Za-z0-9_-]{1,128}$/` (the existing `validId` in `enginev1/api/src/lib/itinerary.ts` — import it, don't reimplement).
- `locationFields[].type` is one of exactly: `text`, `textarea`, `number`, `coords`, `images`, `select`, `boolean`, `image`, `checkpoints`, `multiselect`.
- A Firestore `apps/{appId}` doc never stores its own `appId` as a field — the document ID *is* the appId (confirmed via `registryDoc()` in `test/helpers.ts`, which strips it before writing, and the existing `GET /apps` handler, which builds `appId: doc.id`). Every new route must preserve this: strip `appId` from the body before writing on create, never accept it as a field to update on `PUT`.

---

## Part A — Backend (`enginev1/api`)

### Task 1: Extract `locationFields` validation into a shared lib

Pure refactor, no behavior change — required before Task 3/4 because `POST /apps` and `PUT /apps/:appId` need the exact same `locationFields` validation that today only exists, private, inside `admin.ts`.

**Files:**
- Create: `enginev1/api/src/lib/locationFields.ts`
- Modify: `enginev1/api/src/routes/admin.ts:1-46`

**Interfaces:**
- Produces: `validateLocationFields(value: unknown): LocationFieldSchema[] | null` and `LOCATION_FIELD_TYPES: Set<string>`, both exported from `enginev1/api/src/lib/locationFields.ts`. Tasks 3 and 4 import `validateLocationFields` from here.

- [ ] **Step 1: Record the baseline**

Run: `cd enginev1/api && npm test`
Expected: `ℹ tests 137`, `ℹ pass 137`, `ℹ fail 0` (this is the number every later step's "after" count is measured against).

- [ ] **Step 2: Create the shared lib**

Create `enginev1/api/src/lib/locationFields.ts`:

```ts
import type { LocationFieldSchema } from "../types";

export const LOCATION_FIELD_TYPES = new Set([
  "text", "textarea", "number", "coords", "images", "select", "boolean", "image",
  "checkpoints", "multiselect",
]);
const RESERVED_FIELD_KEYS = new Set(["id", "createdAt", "updatedAt"]);

// Returns null on any validation failure — caller responds 400.
export function validateLocationFields(value: unknown): LocationFieldSchema[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const fields: LocationFieldSchema[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) return null;
    const { key, label, type, options, required } = raw as Record<string, unknown>;
    if (typeof key !== "string" || !key.trim() || RESERVED_FIELD_KEYS.has(key) || seen.has(key)) return null;
    if (typeof label !== "string" || !label.trim()) return null;
    if (typeof type !== "string" || !LOCATION_FIELD_TYPES.has(type)) return null;
    if (options !== undefined && !(Array.isArray(options) && options.every((o) => typeof o === "string"))) return null;
    if (required !== undefined && typeof required !== "boolean") return null;
    seen.add(key);
    fields.push({
      key,
      label,
      type: type as LocationFieldSchema["type"],
      ...(options !== undefined && { options }),
      ...(required !== undefined && { required }),
    });
  }
  return fields;
}
```

- [ ] **Step 3: Remove the duplicated block from `admin.ts` and import instead**

In `enginev1/api/src/routes/admin.ts`, delete lines 17–46 (the `LOCATION_FIELD_TYPES` const, `RESERVED_FIELD_KEYS` const, and `validateLocationFields` function — everything between `const IMAGE_EXTENSIONS = {...}`/`const MAX_IMAGE_BYTES = ...` and `const admin = new Hono...`).

Change the import block at the top from:

```ts
import { Hono } from "hono";
import type { Env, Vars } from "../index";
import type { LocationFieldSchema } from "../types";
import { getFirestoreAdmin } from "../lib/firestore-admin";
import { verifyAdmin } from "../lib/auth";
import { validId, genId, parseCreateInput, parseUpdateInput } from "../lib/itinerary";
import { lookupUsersByUid } from "../lib/identity-toolkit";
```

to:

```ts
import { Hono } from "hono";
import type { Env, Vars } from "../index";
import { getFirestoreAdmin } from "../lib/firestore-admin";
import { verifyAdmin } from "../lib/auth";
import { validId, genId, parseCreateInput, parseUpdateInput } from "../lib/itinerary";
import { lookupUsersByUid } from "../lib/identity-toolkit";
import { validateLocationFields } from "../lib/locationFields";
```

(`LocationFieldSchema` is dropped — after the move it's no longer referenced directly in this file; `validateLocationFields`'s own return type carries it.)

- [ ] **Step 4: Run tests, confirm no regression**

Run: `cd enginev1/api && npm test`
Expected: `ℹ tests 137`, `ℹ pass 137`, `ℹ fail 0` — identical to Step 1. If anything fails, the extraction changed behavior; diff the moved function against the original before proceeding.

- [ ] **Step 5: Commit**

```bash
cd enginev1/api
git add src/lib/locationFields.ts src/routes/admin.ts
git commit -m "refactor: extract locationFields validation into lib/locationFields.ts"
```

---

### Task 2: `GET /v1/admin/apps/:appId`

**Files:**
- Modify: `enginev1/api/src/routes/adminApps.ts`
- Modify: `enginev1/api/test/admin-apps.test.ts`

**Interfaces:**
- Consumes: `getFirestoreAdmin(env, projectId).getDoc(path): Promise<Record<string, any> | null>` (existing, from `lib/firestore-admin.ts`).
- Produces: `GET /v1/admin/apps/:appId` → `200 { ok: true, data: { app: { appId, ...fields } } }` | `404 { ok: false, error: "app_not_found" }` | `401 { ok: false, error: "unauthorized" }`.

- [ ] **Step 1: Write the failing tests**

Append to `enginev1/api/test/admin-apps.test.ts` (reuses the `kp`/`adminToken`/`userToken`/`REGISTRY_PROJECT` already set up in that file's `before()`):

```ts
test("GET /v1/admin/apps/:appId — no token returns 401", async () => {
  const { fn } = mockFetch([]);
  globalThis.fetch = fn as any;

  const res = await app.request("/v1/admin/apps/cones", {}, makeEnv());
  assert.equal(res.status, 401);
});

test("GET /v1/admin/apps/:appId — non-admin token returns 401", async () => {
  const { fn } = mockFetch([jwksRoute(kp.jwk)]);
  globalThis.fetch = fn as any;

  const res = await app.request(
    "/v1/admin/apps/cones",
    { headers: { Authorization: `Bearer ${userToken}` } },
    makeEnv()
  );
  assert.equal(res.status, 401);
});

test("GET /v1/admin/apps/:appId — unknown appId returns 404", async () => {
  const { fn } = mockFetch([
    jwksRoute(kp.jwk),
    { match: "apps/ghost-app", method: "GET", status: 404, json: {} },
  ]);
  globalThis.fetch = fn as any;

  const res = await app.request(
    "/v1/admin/apps/ghost-app",
    { headers: { Authorization: `Bearer ${adminToken}` } },
    makeEnv()
  );
  assert.equal(res.status, 404);
  const body = (await res.json()) as any;
  assert.equal(body.error, "app_not_found");
});

test("GET /v1/admin/apps/:appId — admin token returns the full doc", async () => {
  const { fn } = mockFetch([
    jwksRoute(kp.jwk),
    { match: "apps/cones", method: "GET", json: registryDoc("cones") },
  ]);
  globalThis.fetch = fn as any;

  const res = await app.request(
    "/v1/admin/apps/cones",
    { headers: { Authorization: `Bearer ${adminToken}` } },
    makeEnv()
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.equal(body.data.app.appId, "cones");
  assert.deepEqual(body.data.app.theme, { primary: "#2c2c2a" });
  assert.equal(body.data.app.firebaseProject, "cones-app-fd230");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd enginev1/api && npm test`
Expected: the 4 new tests FAIL (route doesn't exist yet — Hono returns 404 for the unmatched path, so the 401 tests fail as "expected 401, got 404" and the two others fail on missing `app` in the body). `ℹ tests 141`, `ℹ fail` > 0.

- [ ] **Step 3: Implement the route**

In `enginev1/api/src/routes/adminApps.ts`, add after the existing `GET /apps` handler:

```ts
// GET /v1/admin/apps/:appId
// Full config doc for one app. The Firestore doc itself has no stored
// `appId` field (it's the document ID) — reconstructed here the same way
// GET /apps already does for the list.
adminApps.get("/apps/:appId", async (c) => {
  const user = await verifyAdmin(c.req.header("Authorization"), [c.env.FIREBASE_PROJECT_ID]);
  if (!user) return c.json({ ok: false, error: "unauthorized" }, 401);

  const appId = c.req.param("appId");
  const client = getFirestoreAdmin(c.env, c.env.FIREBASE_PROJECT_ID);
  const doc = await client.getDoc(`apps/${appId}`);
  if (!doc) return c.json({ ok: false, error: "app_not_found" }, 404);

  const { id, ...fields } = doc;
  return c.json({ ok: true, data: { app: { appId: id, ...fields } } });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd enginev1/api && npm test`
Expected: `ℹ tests 141`, `ℹ pass 141`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
cd enginev1/api
git add src/routes/adminApps.ts test/admin-apps.test.ts
git commit -m "feat: add GET /v1/admin/apps/:appId"
```

---

### Task 3: `POST /v1/admin/apps`

**Files:**
- Modify: `enginev1/api/src/routes/adminApps.ts`
- Modify: `enginev1/api/test/admin-apps.test.ts`

**Interfaces:**
- Consumes: `validateLocationFields` (Task 1), `validId` (`lib/itinerary.ts`), `client.commit(writes)`, `client.docName(path)`, `client.encode(fields)` (all existing on `FirestoreAdminClient`), `FirestoreAdminError` (existing, from `lib/firestore-admin.ts`, has a `.status` property).
- Produces: `POST /v1/admin/apps` → `201 { ok: true, data: { app: { appId, ...fields } } }` | `400 { ok: false, error: "invalid_<field>" }` | `409 { ok: false, error: "app_already_exists" }` | `401 { ok: false, error: "unauthorized" }`.

- [ ] **Step 1: Write the failing tests**

Append to `enginev1/api/test/admin-apps.test.ts`:

```ts
test("POST /v1/admin/apps — no token returns 401", async () => {
  const { fn } = mockFetch([]);
  globalThis.fetch = fn as any;

  const res = await app.request(
    "/v1/admin/apps",
    { method: "POST", body: JSON.stringify({}) },
    makeEnv()
  );
  assert.equal(res.status, 401);
});

test("POST /v1/admin/apps — missing name returns 400", async () => {
  const { fn } = mockFetch([jwksRoute(kp.jwk)]);
  globalThis.fetch = fn as any;

  const res = await app.request(
    "/v1/admin/apps",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        appId: "newapp",
        firebaseProject: "newapp-proj",
        r2Bucket: "aklguide",
        collections: { locations: "locations" },
      }),
    },
    makeEnv()
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as any;
  assert.equal(body.error, "invalid_name");
});

test("POST /v1/admin/apps — invalid appId returns 400", async () => {
  const { fn } = mockFetch([jwksRoute(kp.jwk)]);
  globalThis.fetch = fn as any;

  const res = await app.request(
    "/v1/admin/apps",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        appId: "not a valid id!",
        name: "New App",
        firebaseProject: "newapp-proj",
        r2Bucket: "aklguide",
        collections: { locations: "locations" },
      }),
    },
    makeEnv()
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as any;
  assert.equal(body.error, "invalid_app_id");
});

test("POST /v1/admin/apps — success creates the doc", async () => {
  const { fn, calls } = mockFetch([
    jwksRoute(kp.jwk),
    { match: ":commit", method: "POST", json: {} },
  ]);
  globalThis.fetch = fn as any;

  const res = await app.request(
    "/v1/admin/apps",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        appId: "newapp",
        name: "New App",
        firebaseProject: "newapp-proj",
        r2Bucket: "aklguide",
        collections: { locations: "locations" },
        theme: { primary: "#000000" },
        map: { center: [-36.8, 174.7] },
        features: {
          completion: { enabled: false },
          itinerary: { enabled: false },
          push: { enabled: false },
          redemption: { enabled: false },
        },
      }),
    },
    makeEnv()
  );
  assert.equal(res.status, 201);
  const body = (await res.json()) as any;
  assert.equal(body.data.app.appId, "newapp");
  assert.equal(body.data.app.name, "New App");

  const commitCall = calls.find((c) => c.url.includes(":commit"));
  assert.ok(commitCall, "expected a :commit call");
  const write = commitCall!.body.writes[0];
  assert.ok(write.update.name.endsWith("apps/newapp"));
  assert.equal(write.currentDocument.exists, false);
  assert.equal(write.update.fields.appId, undefined, "appId must not be written as a field");
});

test("POST /v1/admin/apps — duplicate appId returns 409", async () => {
  const { fn } = mockFetch([
    jwksRoute(kp.jwk),
    { match: ":commit", method: "POST", status: 409, json: { error: { status: "ALREADY_EXISTS" } } },
  ]);
  globalThis.fetch = fn as any;

  const res = await app.request(
    "/v1/admin/apps",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        appId: "cones",
        name: "Cones",
        firebaseProject: "cones-app-fd230",
        r2Bucket: "aklguide",
        collections: { locations: "cones" },
      }),
    },
    makeEnv()
  );
  assert.equal(res.status, 409);
  const body = (await res.json()) as any;
  assert.equal(body.error, "app_already_exists");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd enginev1/api && npm test`
Expected: the 5 new tests FAIL (no route yet). `ℹ tests 146`.

- [ ] **Step 3: Implement the route**

In `enginev1/api/src/routes/adminApps.ts`, add the validator function and the route. Update the import line to add `FirestoreAdminError` and `validId`:

```ts
import { getFirestoreAdmin, FirestoreAdminError } from "../lib/firestore-admin";
import { validId } from "../lib/itinerary";
import { validateLocationFields } from "../lib/locationFields";
import type { LocationFieldSchema } from "../types";
```

Add before `export default adminApps;`:

```ts
function validateAppConfigCreate(
  body: unknown
): { appId: string; fields: Record<string, unknown> } | { error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { error: "invalid_body" };
  const { appId, name, firebaseProject, r2Bucket, collections, locationFields, ...rest } =
    body as Record<string, unknown>;

  if (!validId(appId)) return { error: "invalid_app_id" };
  if (typeof name !== "string" || !name.trim()) return { error: "invalid_name" };
  if (typeof firebaseProject !== "string" || !firebaseProject.trim()) return { error: "invalid_firebase_project" };
  if (typeof r2Bucket !== "string" || !r2Bucket.trim()) return { error: "invalid_r2_bucket" };
  if (typeof collections !== "object" || collections === null || Array.isArray(collections))
    return { error: "invalid_collections" };
  const { locations } = collections as Record<string, unknown>;
  if (typeof locations !== "string" || !locations.trim()) return { error: "invalid_collections_locations" };

  let validatedLocationFields: LocationFieldSchema[] | undefined;
  if (locationFields !== undefined) {
    const parsed = validateLocationFields(locationFields);
    if (!parsed) return { error: "invalid_location_fields" };
    validatedLocationFields = parsed;
  }

  return {
    appId,
    fields: {
      name, firebaseProject, r2Bucket, collections,
      ...(validatedLocationFields !== undefined && { locationFields: validatedLocationFields }),
      ...rest,
    },
  };
}

// POST /v1/admin/apps
// Registers a new appId. currentDocument.exists:false makes this
// create-or-fail — same atomic pattern admin.ts uses for locations.
adminApps.post("/apps", async (c) => {
  const user = await verifyAdmin(c.req.header("Authorization"), [c.env.FIREBASE_PROJECT_ID]);
  if (!user) return c.json({ ok: false, error: "unauthorized" }, 401);

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const validated = validateAppConfigCreate(body);
  if ("error" in validated) return c.json({ ok: false, error: validated.error }, 400);
  const { appId, fields } = validated;

  const client = getFirestoreAdmin(c.env, c.env.FIREBASE_PROJECT_ID);
  try {
    await client.commit([
      {
        update: { name: client.docName(`apps/${appId}`), fields: client.encode(fields) },
        currentDocument: { exists: false },
      },
    ]);
  } catch (e) {
    if (e instanceof FirestoreAdminError && e.status === 409)
      return c.json({ ok: false, error: "app_already_exists" }, 409);
    throw e;
  }

  return c.json({ ok: true, data: { app: { appId, ...fields } } }, 201);
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd enginev1/api && npm test`
Expected: `ℹ tests 146`, `ℹ pass 146`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
cd enginev1/api
git add src/routes/adminApps.ts test/admin-apps.test.ts
git commit -m "feat: add POST /v1/admin/apps"
```

---

### Task 4: `PUT /v1/admin/apps/:appId`

**Files:**
- Modify: `enginev1/api/src/routes/adminApps.ts`
- Modify: `enginev1/api/test/admin-apps.test.ts`

**Interfaces:**
- Consumes: same as Task 3, plus `client.getDoc` (Task 2).
- Produces: `PUT /v1/admin/apps/:appId` → `200 { ok: true, data: { app } }` | `400 { ok: false, error: "invalid_<field>" }` | `404 { ok: false, error: "app_not_found" }` | `401 { ok: false, error: "unauthorized" }`.

- [ ] **Step 1: Write the failing tests**

Append to `enginev1/api/test/admin-apps.test.ts`:

```ts
test("PUT /v1/admin/apps/:appId — no token returns 401", async () => {
  const { fn } = mockFetch([]);
  globalThis.fetch = fn as any;

  const res = await app.request(
    "/v1/admin/apps/cones",
    { method: "PUT", body: JSON.stringify({ name: "Cones v2" }) },
    makeEnv()
  );
  assert.equal(res.status, 401);
});

test("PUT /v1/admin/apps/:appId — invalid field returns 400", async () => {
  const { fn } = mockFetch([jwksRoute(kp.jwk)]);
  globalThis.fetch = fn as any;

  const res = await app.request(
    "/v1/admin/apps/cones",
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: "" }),
    },
    makeEnv()
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as any;
  assert.equal(body.error, "invalid_name");
});

test("PUT /v1/admin/apps/:appId — unknown appId returns 404", async () => {
  const { fn } = mockFetch([
    jwksRoute(kp.jwk),
    { match: "apps/ghost-app", method: "GET", status: 404, json: {} },
  ]);
  globalThis.fetch = fn as any;

  const res = await app.request(
    "/v1/admin/apps/ghost-app",
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: "Ghost" }),
    },
    makeEnv()
  );
  assert.equal(res.status, 404);
  const body = (await res.json()) as any;
  assert.equal(body.error, "app_not_found");
});

test("PUT /v1/admin/apps/:appId — success updates only the given fields", async () => {
  const { fn, calls } = mockFetch([
    jwksRoute(kp.jwk),
    { match: "apps/cones", method: "GET", json: registryDoc("cones") },
    { match: ":commit", method: "POST", json: {} },
  ]);
  globalThis.fetch = fn as any;

  const res = await app.request(
    "/v1/admin/apps/cones",
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: "Cones Updated" }),
    },
    makeEnv()
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.equal(body.data.app.name, "Cones Updated");
  assert.equal(body.data.app.appId, "cones");

  const commitCall = calls.find((c) => c.url.includes(":commit"));
  assert.ok(commitCall, "expected a :commit call");
  const write = commitCall!.body.writes[0];
  assert.deepEqual(write.updateMask.fieldPaths, ["name"]);
  assert.equal(write.currentDocument.exists, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd enginev1/api && npm test`
Expected: the 4 new tests FAIL (no route yet). `ℹ tests 150`.

- [ ] **Step 3: Implement the route**

Add to `enginev1/api/src/routes/adminApps.ts`, before `export default adminApps;`:

```ts
function validateAppConfigUpdate(
  body: Record<string, unknown>
): { fields: Record<string, unknown> } | { error: string } {
  const { name, firebaseProject, r2Bucket, collections, locationFields, ...rest } = body;
  const fields: Record<string, unknown> = { ...rest };

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) return { error: "invalid_name" };
    fields.name = name;
  }
  if (firebaseProject !== undefined) {
    if (typeof firebaseProject !== "string" || !firebaseProject.trim()) return { error: "invalid_firebase_project" };
    fields.firebaseProject = firebaseProject;
  }
  if (r2Bucket !== undefined) {
    if (typeof r2Bucket !== "string" || !r2Bucket.trim()) return { error: "invalid_r2_bucket" };
    fields.r2Bucket = r2Bucket;
  }
  if (collections !== undefined) {
    if (typeof collections !== "object" || collections === null || Array.isArray(collections))
      return { error: "invalid_collections" };
    const { locations } = collections as Record<string, unknown>;
    if (locations !== undefined && (typeof locations !== "string" || !locations.trim()))
      return { error: "invalid_collections_locations" };
    fields.collections = collections;
  }
  if (locationFields !== undefined) {
    const parsed = validateLocationFields(locationFields);
    if (!parsed) return { error: "invalid_location_fields" };
    fields.locationFields = parsed;
  }

  return { fields };
}

// PUT /v1/admin/apps/:appId
// Partial update — only the fields present in the body are touched
// (updateMask), and appId in the body (if present) is ignored: the URL
// param is the only source of identity.
adminApps.put("/apps/:appId", async (c) => {
  const user = await verifyAdmin(c.req.header("Authorization"), [c.env.FIREBASE_PROJECT_ID]);
  if (!user) return c.json({ ok: false, error: "unauthorized" }, 401);

  const appId = c.req.param("appId");
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const { appId: _ignored, ...rest } = body;
  const validated = validateAppConfigUpdate(rest);
  if ("error" in validated) return c.json({ ok: false, error: validated.error }, 400);

  const client = getFirestoreAdmin(c.env, c.env.FIREBASE_PROJECT_ID);
  const existing = await client.getDoc(`apps/${appId}`);
  if (!existing) return c.json({ ok: false, error: "app_not_found" }, 404);

  await client.commit([
    {
      update: { name: client.docName(`apps/${appId}`), fields: client.encode(validated.fields) },
      updateMask: { fieldPaths: Object.keys(validated.fields) },
      currentDocument: { exists: true },
    },
  ]);

  const { id: _id, ...existingFields } = existing;
  return c.json({ ok: true, data: { app: { appId, ...existingFields, ...validated.fields } } });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd enginev1/api && npm test`
Expected: `ℹ tests 150`, `ℹ pass 150`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
cd enginev1/api
git add src/routes/adminApps.ts test/admin-apps.test.ts
git commit -m "feat: add PUT /v1/admin/apps/:appId"
```

---

### Task 5: `DELETE /v1/admin/apps/:appId`

**Files:**
- Modify: `enginev1/api/src/routes/adminApps.ts`
- Modify: `enginev1/api/test/admin-apps.test.ts`

**Interfaces:**
- Produces: `DELETE /v1/admin/apps/:appId` → `200 { ok: true, data: null }` | `404 { ok: false, error: "app_not_found" }` | `401 { ok: false, error: "unauthorized" }`.

- [ ] **Step 1: Write the failing tests**

Append to `enginev1/api/test/admin-apps.test.ts`:

```ts
test("DELETE /v1/admin/apps/:appId — no token returns 401", async () => {
  const { fn } = mockFetch([]);
  globalThis.fetch = fn as any;

  const res = await app.request("/v1/admin/apps/cones", { method: "DELETE" }, makeEnv());
  assert.equal(res.status, 401);
});

test("DELETE /v1/admin/apps/:appId — unknown appId returns 404", async () => {
  const { fn } = mockFetch([
    jwksRoute(kp.jwk),
    { match: "apps/ghost-app", method: "GET", status: 404, json: {} },
  ]);
  globalThis.fetch = fn as any;

  const res = await app.request(
    "/v1/admin/apps/ghost-app",
    { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } },
    makeEnv()
  );
  assert.equal(res.status, 404);
  const body = (await res.json()) as any;
  assert.equal(body.error, "app_not_found");
});

test("DELETE /v1/admin/apps/:appId — success deletes the doc", async () => {
  const { fn, calls } = mockFetch([
    jwksRoute(kp.jwk),
    { match: "apps/cones", method: "GET", json: registryDoc("cones") },
    { match: ":commit", method: "POST", json: {} },
  ]);
  globalThis.fetch = fn as any;

  const res = await app.request(
    "/v1/admin/apps/cones",
    { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } },
    makeEnv()
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as any;
  assert.equal(body.data, null);

  const commitCall = calls.find((c) => c.url.includes(":commit"));
  assert.ok(commitCall, "expected a :commit call");
  assert.ok(commitCall!.body.writes[0].delete.endsWith("apps/cones"));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd enginev1/api && npm test`
Expected: the 3 new tests FAIL (no route yet). `ℹ tests 153`.

- [ ] **Step 3: Implement the route**

Add to `enginev1/api/src/routes/adminApps.ts`, before `export default adminApps;`:

```ts
// DELETE /v1/admin/apps/:appId
// Checked-then-delete, not a raw commit — gives a clean 404 instead of a
// silent no-op when the appId doesn't exist.
adminApps.delete("/apps/:appId", async (c) => {
  const user = await verifyAdmin(c.req.header("Authorization"), [c.env.FIREBASE_PROJECT_ID]);
  if (!user) return c.json({ ok: false, error: "unauthorized" }, 401);

  const appId = c.req.param("appId");
  const client = getFirestoreAdmin(c.env, c.env.FIREBASE_PROJECT_ID);
  const existing = await client.getDoc(`apps/${appId}`);
  if (!existing) return c.json({ ok: false, error: "app_not_found" }, 404);

  await client.commit([{ delete: client.docName(`apps/${appId}`) }]);

  return c.json({ ok: true, data: null });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd enginev1/api && npm test`
Expected: `ℹ tests 153`, `ℹ pass 153`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
cd enginev1/api
git add src/routes/adminApps.ts test/admin-apps.test.ts
git commit -m "feat: add DELETE /v1/admin/apps/:appId"
```

- [ ] **Step 6: Stop and confirm before deploying**

Do **not** run `wrangler deploy` yet. Run `git status` in `enginev1/api` — the pre-existing unrelated changes flagged in Global Constraints are still sitting there uncommitted. Show the user the full diff (`git diff`) and ask explicitly whether to deploy now (which ships both this feature and that other pending work) or hold off. This is a live, shared Worker — do not deploy without that confirmation.

---

## Part B — Frontend (`blacksands/registry-admin/`)

### Task 6: Scaffold the app + auth gate

Produces a runnable app: `npm run dev`, log in with an admin account, land on an (empty-for-now) Apps page. This is the first end-to-end-testable milestone — it proves auth works against the real deployed API before any CRUD UI is built on top.

**Files:**
- Create: `registry-admin/package.json`, `registry-admin/vite.config.ts`, `registry-admin/tailwind.config.js`, `registry-admin/postcss.config.js`, `registry-admin/tsconfig.json`, `registry-admin/tsconfig.app.json`, `registry-admin/tsconfig.node.json`, `registry-admin/index.html`
- Create: `registry-admin/src/main.tsx`, `registry-admin/src/index.css`, `registry-admin/src/router.tsx`, `registry-admin/src/firebase.ts`
- Create: `registry-admin/src/api/appsClient.ts` (partial — `listApps` only; extended in Task 7)
- Create: `registry-admin/src/auth/useAdmin.ts`
- Create: `registry-admin/src/pages/LoginPage.tsx`, `registry-admin/src/pages/NotAdminPage.tsx`, `registry-admin/src/pages/AdminLayout.tsx`, `registry-admin/src/pages/AppsPage.tsx` (placeholder — list only, replaced in Task 9)

**Interfaces:**
- Produces: `listApps(idToken: string): Promise<{ apps: AppSummary[] }>` and `class ApiError extends Error { status: number }`, both from `src/api/appsClient.ts` — Task 7 adds `getApp`/`createApp`/`updateApp`/`deleteApp` to the same file; Task 9 consumes all five.
- Produces: `useAdmin(): AdminState` from `src/auth/useAdmin.ts`, where `AdminState = { status: "loading" } | { status: "signedOut" } | { status: "notAdmin"; user: User } | { status: "admin"; user: User } | { status: "error"; message: string; user?: User }` — consumed by `AdminLayout.tsx` and `NotAdminPage.tsx`.

- [ ] **Step 1: `npm create vite` scaffold + deps**

```bash
cd blacksands
npm create vite@latest registry-admin -- --template react-ts
cd registry-admin
npm install firebase react-router-dom
npm install -D tailwindcss postcss autoprefixer
```

- [ ] **Step 2: Replace the generated Tailwind/PostCSS/Vite config**

Overwrite `registry-admin/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

Overwrite `registry-admin/postcss.config.js`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

`registry-admin/vite.config.ts` (generated file is already this exact content — confirm, don't change):

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

Overwrite `registry-admin/src/index.css` (delete any generated content, replace entirely):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Overwrite `registry-admin/index.html`'s `<title>` to `<title>registry admin</title>`.

Delete the generated `registry-admin/src/App.tsx`, `registry-admin/src/App.css`, and `registry-admin/src/assets/react.svg` — unused (routing goes through `router.tsx` directly from `main.tsx`, not through `<App/>`).

- [ ] **Step 3: `firebase.ts`**

Create `registry-admin/src/firebase.ts`:

```ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC3RqOh9GBn-Pl_S2NVobHaUwaQdtap9Mo",
  authDomain: "blacksands-a37aa.firebaseapp.com",
  projectId: "blacksands-a37aa",
  storageBucket: "blacksands-a37aa.firebasestorage.app",
  messagingSenderId: "380028594691",
  appId: "1:380028594691:web:af4e8e3df7ad54bdcbbc36",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
```

(No `getFirestore` export — this app never imports `firebase/firestore`, by design; see the spec's rules-hardening section.)

- [ ] **Step 4: `api/appsClient.ts` (list only for now)**

Create `registry-admin/src/api/appsClient.ts`:

```ts
const BASE_URL = "https://api.blacksands.app/v1/admin";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, idToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json();
  if (!res.ok || !body.ok) throw new ApiError(res.status, body.error ?? "request_failed");
  return body.data as T;
}

export type AppSummary = { appId: string; name: string; theme: Record<string, string> };

export function listApps(idToken: string): Promise<{ apps: AppSummary[] }> {
  return request("/apps", idToken);
}
```

- [ ] **Step 5: `auth/useAdmin.ts`**

Create `registry-admin/src/auth/useAdmin.ts`:

```ts
import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../firebase";
import { listApps, ApiError } from "../api/appsClient";

export type AdminState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "notAdmin"; user: User }
  | { status: "admin"; user: User }
  | { status: "error"; message: string; user?: User };

export function useAdmin(): AdminState {
  const [state, setState] = useState<AdminState>({ status: "loading" });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ status: "signedOut" });
        return;
      }

      try {
        const idToken = await user.getIdToken();
        await listApps(idToken);
        setState({ status: "admin", user });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setState({ status: "notAdmin", user });
          return;
        }
        console.error("useAdmin check failed:", e);
        setState({
          status: "error",
          message: e instanceof Error ? e.message : "Failed to check admin status",
          user,
        });
      }
    });

    return () => unsub();
  }, []);

  return state;
}
```

- [ ] **Step 6: Pages — `LoginPage`, `NotAdminPage`, `AdminLayout`, placeholder `AppsPage`**

Create `registry-admin/src/pages/LoginPage.tsx`:

```tsx
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      nav("/apps");
    } catch (e: any) {
      setErr(e?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Registry Admin</h1>
          <p className="text-sm text-slate-600 mt-1">Sign in to manage the apps config registry.</p>
        </div>

        {err && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
        )}

        <form onSubmit={login} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Password</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
              placeholder="••••••••"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-white font-medium shadow-sm hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

Create `registry-admin/src/pages/NotAdminPage.tsx`:

```tsx
import { useAdmin } from "../auth/useAdmin";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";

export default function NotAdminPage() {
  const state = useAdmin();
  if (state.status !== "notAdmin") return null;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h1 className="text-xl font-semibold text-slate-900">Access denied</h1>
        <p className="text-sm text-slate-600 mt-1">
          This account is signed in, but doesn't carry the admin claim.
        </p>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm text-slate-700 font-medium">Your email</div>
          <div className="mt-1 font-mono text-sm text-slate-900 break-all">{state.user.email}</div>
          <div className="mt-3 text-sm text-slate-600">
            Grant it from <code className="px-1 py-0.5 rounded bg-white border border-slate-200">enginev1/api</code>:
            <div className="mt-2 font-mono text-xs bg-white border border-slate-200 rounded-lg p-3">
              GOOGLE_APPLICATION_CREDENTIALS=./blacksands-service-account.json \<br />
              &nbsp;&nbsp;node scripts/grant-admin.mjs {state.user.email}
            </div>
            Then sign out and back in.
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => signOut(auth)}
            className="rounded-xl bg-slate-900 px-4 py-2 text-white font-medium hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
```

Create `registry-admin/src/pages/AdminLayout.tsx`:

```tsx
import { Navigate, Outlet, NavLink } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useAdmin } from "../auth/useAdmin";

function TabLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "px-3 py-2 rounded-xl text-sm font-medium transition",
          isActive ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100",
        ].join(" ")
      }
    >
      {label}
    </NavLink>
  );
}

export default function AdminLayout() {
  const state = useAdmin();

  if (state.status === "error") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-left">
          <div className="font-semibold text-slate-900">Admin check failed</div>
          <div className="mt-2 text-sm text-slate-600">{state.message}</div>
          <button
            onClick={() => signOut(auth)}
            className="mt-5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-600">Loading…</div>
      </div>
    );
  }

  if (state.status === "signedOut") return <Navigate to="/login" replace />;
  if (state.status === "notAdmin") return <Navigate to="/not-admin" replace />;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-semibold">
              R
            </div>
            <div>
              <div className="font-semibold text-slate-900">Registry Admin</div>
              <div className="text-xs text-slate-500">Manage the apps config registry</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <TabLink to="/apps" label="Apps" />
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-xs text-slate-500">{state.user.email}</div>
            <button
              onClick={() => signOut(auth)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
```

Create a placeholder `registry-admin/src/pages/AppsPage.tsx` (replaced fully in Task 9 — this version only proves the auth+fetch chain works end to end):

```tsx
import { useEffect, useState } from "react";
import { auth } from "../firebase";
import { listApps, type AppSummary } from "../api/appsClient";

export default function AppsPage() {
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await auth.currentUser!.getIdToken();
      const { apps } = await listApps(token);
      setApps(apps);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Apps registry</h1>
      {loading ? <p className="mt-4 text-slate-600">Loading…</p> : (
        <ul className="mt-4 space-y-1">
          {apps.map((a) => <li key={a.appId} className="text-slate-700">{a.appId} — {a.name}</li>)}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 7: `router.tsx` and `main.tsx`**

Create `registry-admin/src/router.tsx`:

```tsx
import { createBrowserRouter, Navigate } from "react-router-dom";
import AdminLayout from "./pages/AdminLayout";
import LoginPage from "./pages/LoginPage";
import NotAdminPage from "./pages/NotAdminPage";
import AppsPage from "./pages/AppsPage";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/apps" replace /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/not-admin", element: <NotAdminPage /> },
  {
    path: "/",
    element: <AdminLayout />,
    children: [{ path: "apps", element: <AppsPage /> }],
  },
]);
```

Overwrite `registry-admin/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
```

- [ ] **Step 8: Manual verification**

Precondition: your account must already carry the `admin: true` custom claim on `blacksands-a37aa` (see Global Constraints — run `grant-admin.mjs` first if it doesn't).

Run: `cd blacksands/registry-admin && npm run dev`, open the printed local URL.
Expected: redirected to `/login`; after signing in with an admin-claimed account, redirected to `/apps` showing the 4 real registered apps (`cones`, `rings`, `eats`, `guideakl` or similar) fetched live from `https://api.blacksands.app/v1/admin/apps`. Signing in with a non-admin account instead lands on `/not-admin`.

- [ ] **Step 9: Commit**

```bash
cd blacksands
git add registry-admin/
git commit -m "feat: scaffold registry-admin app with auth gate"
```

---

### Task 7: Full `appsClient` + `AppConfig` model + form-state transforms

**Files:**
- Modify: `registry-admin/src/api/appsClient.ts`
- Create: `registry-admin/src/models/appConfig.ts`
- Create: `registry-admin/src/lib/appAdmin.ts`

**Interfaces:**
- Consumes: `ApiError`, `request<T>` (Task 6, same file).
- Produces: `getApp`, `createApp`, `updateApp`, `deleteApp` added to `src/api/appsClient.ts`. `AppConfig`, `LocationFieldSchema`, `LocationFieldType`, `CompletionConfig`, `AppFormState`, `LocationFieldFormRow`, `ThemeRow`, `LOCATION_FIELD_TYPES` from `src/models/appConfig.ts`. `emptyForm: AppFormState`, `toFormState(app: AppConfig): AppFormState`, `fromFormState(form: AppFormState): { errors: string[]; config: AppConfig | null }` from `src/lib/appAdmin.ts` — all consumed by Task 8's components and Task 9's `AppsPage`.

- [ ] **Step 1: Extend `appsClient.ts`**

Append to `registry-admin/src/api/appsClient.ts` (add the import at the top):

```ts
import type { AppConfig } from "../models/appConfig";
```

```ts
export function getApp(idToken: string, appId: string): Promise<{ app: AppConfig }> {
  return request(`/apps/${encodeURIComponent(appId)}`, idToken);
}

export function createApp(idToken: string, body: AppConfig): Promise<{ app: AppConfig }> {
  return request("/apps", idToken, { method: "POST", body: JSON.stringify(body) });
}

export function updateApp(
  idToken: string,
  appId: string,
  body: Omit<Partial<AppConfig>, "appId">
): Promise<{ app: AppConfig }> {
  return request(`/apps/${encodeURIComponent(appId)}`, idToken, { method: "PUT", body: JSON.stringify(body) });
}

export function deleteApp(idToken: string, appId: string): Promise<null> {
  return request(`/apps/${encodeURIComponent(appId)}`, idToken, { method: "DELETE" });
}
```

- [ ] **Step 2: `models/appConfig.ts`**

Create `registry-admin/src/models/appConfig.ts`:

```ts
export type LocationFieldType =
  | "text" | "textarea" | "number" | "coords" | "images"
  | "select" | "boolean" | "image" | "checkpoints" | "multiselect";

export const LOCATION_FIELD_TYPES: LocationFieldType[] = [
  "text", "textarea", "number", "coords", "images",
  "select", "boolean", "image", "checkpoints", "multiselect",
];

export type LocationFieldSchema = {
  key: string;
  label: string;
  type: LocationFieldType;
  options?: string[];
  required?: boolean;
};

export type CompletionConfig =
  | { enabled: false }
  | {
      enabled: true;
      collection: string;
      methods?: ("tick" | "checkin")[];
      checkin?: { gateRadius: number };
      fields: {
        locationId: string;
        locationSlug: string;
        locationName: string;
        shared: string;
      };
    };

export type AppConfig = {
  appId: string;
  name: string;
  firebaseProject: string;
  r2Bucket: string;
  collections: {
    locations: string;
    reviews?: string;
    itineraries?: string;
  };
  theme: Record<string, string>;
  map: { center: [number, number] };
  locationFields?: LocationFieldSchema[];
  features: {
    completion: CompletionConfig;
    itinerary: { enabled: boolean };
    push: { enabled: boolean };
    redemption: { enabled: boolean };
  };
};

export type ThemeRow = { key: string; value: string };

export type LocationFieldFormRow = {
  key: string;
  label: string;
  type: LocationFieldType;
  required: boolean;
  options: string;
};

export type AppFormState = {
  appId: string;
  name: string;
  firebaseProject: string;
  r2Bucket: string;
  collectionsLocations: string;
  collectionsReviews: string;
  collectionsItineraries: string;
  theme: ThemeRow[];
  mapLat: string;
  mapLng: string;
  completionEnabled: boolean;
  completionCollection: string;
  completionMethodTick: boolean;
  completionMethodCheckin: boolean;
  completionGateRadius: string;
  completionFieldLocationId: string;
  completionFieldLocationSlug: string;
  completionFieldLocationName: string;
  completionFieldShared: string;
  itineraryEnabled: boolean;
  pushEnabled: boolean;
  redemptionEnabled: boolean;
  locationFields: LocationFieldFormRow[];
};
```

- [ ] **Step 3: `lib/appAdmin.ts`**

Create `registry-admin/src/lib/appAdmin.ts`:

```ts
import type { AppConfig, AppFormState } from "../models/appConfig";

export const emptyForm: AppFormState = {
  appId: "",
  name: "",
  firebaseProject: "",
  r2Bucket: "",
  collectionsLocations: "",
  collectionsReviews: "",
  collectionsItineraries: "",
  theme: [{ key: "primary", value: "#000000" }],
  mapLat: "-36.8485",
  mapLng: "174.7633",
  completionEnabled: false,
  completionCollection: "",
  completionMethodTick: false,
  completionMethodCheckin: false,
  completionGateRadius: "80",
  completionFieldLocationId: "",
  completionFieldLocationSlug: "",
  completionFieldLocationName: "",
  completionFieldShared: "",
  itineraryEnabled: false,
  pushEnabled: false,
  redemptionEnabled: false,
  locationFields: [],
};

export function toFormState(app: AppConfig): AppFormState {
  const completion = app.features.completion;
  return {
    appId: app.appId,
    name: app.name,
    firebaseProject: app.firebaseProject,
    r2Bucket: app.r2Bucket,
    collectionsLocations: app.collections.locations,
    collectionsReviews: app.collections.reviews ?? "",
    collectionsItineraries: app.collections.itineraries ?? "",
    theme: Object.entries(app.theme).map(([key, value]) => ({ key, value })),
    mapLat: String(app.map.center[0]),
    mapLng: String(app.map.center[1]),
    completionEnabled: completion.enabled,
    completionCollection: completion.enabled ? completion.collection : "",
    completionMethodTick: completion.enabled ? (completion.methods ?? []).includes("tick") : false,
    completionMethodCheckin: completion.enabled ? (completion.methods ?? []).includes("checkin") : false,
    completionGateRadius: completion.enabled ? String(completion.checkin?.gateRadius ?? 80) : "80",
    completionFieldLocationId: completion.enabled ? completion.fields.locationId : "",
    completionFieldLocationSlug: completion.enabled ? completion.fields.locationSlug : "",
    completionFieldLocationName: completion.enabled ? completion.fields.locationName : "",
    completionFieldShared: completion.enabled ? completion.fields.shared : "",
    itineraryEnabled: app.features.itinerary.enabled,
    pushEnabled: app.features.push.enabled,
    redemptionEnabled: app.features.redemption.enabled,
    locationFields: (app.locationFields ?? []).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: !!f.required,
      options: (f.options ?? []).join(", "),
    })),
  };
}

export function fromFormState(form: AppFormState): { errors: string[]; config: AppConfig | null } {
  const errors: string[] = [];

  if (!form.appId.trim()) errors.push("App ID is required.");
  else if (!/^[A-Za-z0-9_-]{1,128}$/.test(form.appId.trim()))
    errors.push("App ID may only contain letters, numbers, _ and -.");
  if (!form.name.trim()) errors.push("Name is required.");
  if (!form.firebaseProject.trim()) errors.push("Firebase project is required.");
  if (!form.r2Bucket.trim()) errors.push("R2 bucket is required.");
  if (!form.collectionsLocations.trim()) errors.push("Locations collection is required.");

  const lat = Number(form.mapLat);
  const lng = Number(form.mapLng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.push("Map latitude must be between -90 and 90.");
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) errors.push("Map longitude must be between -180 and 180.");

  const theme: Record<string, string> = {};
  for (const row of form.theme) {
    if (!row.key.trim()) continue;
    theme[row.key.trim()] = row.value;
  }

  const locationFields = form.locationFields.map((row, i) => {
    if (!row.key.trim()) errors.push(`Location field ${i + 1}: key is required.`);
    if (!row.label.trim()) errors.push(`Location field ${i + 1}: label is required.`);
    return {
      key: row.key.trim(),
      label: row.label.trim(),
      type: row.type,
      ...(row.required && { required: true }),
      ...(["select", "multiselect"].includes(row.type) && row.options.trim()
        ? { options: row.options.split(",").map((o) => o.trim()).filter(Boolean) }
        : {}),
    };
  });

  let completion: AppConfig["features"]["completion"];
  if (!form.completionEnabled) {
    completion = { enabled: false };
  } else {
    if (!form.completionCollection.trim()) errors.push("Completion collection is required when completion is enabled.");
    if (
      !form.completionFieldLocationId.trim() ||
      !form.completionFieldLocationSlug.trim() ||
      !form.completionFieldLocationName.trim() ||
      !form.completionFieldShared.trim()
    )
      errors.push("All four completion field names are required when completion is enabled.");

    const methods: ("tick" | "checkin")[] = [
      ...(form.completionMethodTick ? (["tick"] as const) : []),
      ...(form.completionMethodCheckin ? (["checkin"] as const) : []),
    ];
    const gateRadius = Number(form.completionGateRadius);
    completion = {
      enabled: true,
      collection: form.completionCollection.trim(),
      ...(methods.length > 0 && { methods }),
      ...(form.completionMethodCheckin && {
        checkin: { gateRadius: Number.isFinite(gateRadius) ? gateRadius : 80 },
      }),
      fields: {
        locationId: form.completionFieldLocationId.trim(),
        locationSlug: form.completionFieldLocationSlug.trim(),
        locationName: form.completionFieldLocationName.trim(),
        shared: form.completionFieldShared.trim(),
      },
    };
  }

  if (errors.length > 0) return { errors, config: null };

  return {
    errors: [],
    config: {
      appId: form.appId.trim(),
      name: form.name.trim(),
      firebaseProject: form.firebaseProject.trim(),
      r2Bucket: form.r2Bucket.trim(),
      collections: {
        locations: form.collectionsLocations.trim(),
        ...(form.collectionsReviews.trim() && { reviews: form.collectionsReviews.trim() }),
        ...(form.collectionsItineraries.trim() && { itineraries: form.collectionsItineraries.trim() }),
      },
      theme,
      map: { center: [lat, lng] },
      ...(locationFields.length > 0 && { locationFields }),
      features: {
        completion,
        itinerary: { enabled: form.itineraryEnabled },
        push: { enabled: form.pushEnabled },
        redemption: { enabled: form.redemptionEnabled },
      },
    },
  };
}
```

- [ ] **Step 4: Manual verification**

Run: `cd blacksands/registry-admin && npx tsc -b`
Expected: no type errors (this file has no UI to click through yet — Task 8/9 wire it up; this step just confirms the module compiles and its exported types line up with `appsClient.ts`'s `AppConfig` import).

- [ ] **Step 5: Commit**

```bash
cd blacksands
git add registry-admin/src/api/appsClient.ts registry-admin/src/models/appConfig.ts registry-admin/src/lib/appAdmin.ts
git commit -m "feat: add full apps CRUD client + AppConfig form-state transforms"
```

---

### Task 8: Form components

**Files:**
- Create: `registry-admin/src/components/ui/FormControls.tsx`
- Create: `registry-admin/src/components/apps/ThemeEditor.tsx`
- Create: `registry-admin/src/components/apps/FeaturesEditor.tsx`
- Create: `registry-admin/src/components/apps/LocationFieldsEditor.tsx`
- Create: `registry-admin/src/components/apps/AppForm.tsx`

**Interfaces:**
- Consumes: `AppFormState`, `ThemeRow`, `LocationFieldFormRow`, `LOCATION_FIELD_TYPES` from `models/appConfig.ts` (Task 7).
- Produces: `AppForm` component with props `{ form: AppFormState; isEditing: boolean; onChange: (patch: Partial<AppFormState>) => void; onSave: () => void; onCancel: () => void; onDelete?: () => void }` — consumed by Task 9's `AppsPage`.

- [ ] **Step 1: `components/ui/FormControls.tsx`**

```tsx
import type React from "react";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 shadow-sm",
        "outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={[
        "rounded-xl bg-indigo-600 px-4 py-2.5 text-white font-medium shadow-sm hover:bg-indigo-500",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={[
        "rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 font-medium hover:bg-slate-100",
        props.className ?? "",
      ].join(" ")}
    />
  );
}
```

- [ ] **Step 2: `components/apps/ThemeEditor.tsx`**

```tsx
import type { ThemeRow } from "../../models/appConfig";
import { Input, SecondaryButton } from "../ui/FormControls";

type Props = {
  rows: ThemeRow[];
  onChange: (rows: ThemeRow[]) => void;
};

export function ThemeEditor({ rows, onChange }: Props) {
  function addRow() {
    onChange([...rows, { key: "", value: "" }]);
  }
  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }
  function update(i: number, patch: Partial<ThemeRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-slate-700">Theme</div>
        <SecondaryButton type="button" onClick={addRow}>Add color</SecondaryButton>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
            <Input value={row.key} onChange={(e) => update(i, { key: e.target.value })} placeholder="primary" />
            <Input value={row.value} onChange={(e) => update(i, { value: e.target.value })} placeholder="#2c2c2a" />
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="text-xs rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700 hover:bg-rose-100"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `components/apps/FeaturesEditor.tsx`**

```tsx
import type { AppFormState } from "../../models/appConfig";
import { Input } from "../ui/FormControls";

type Props = {
  form: AppFormState;
  onChange: (patch: Partial<AppFormState>) => void;
};

export function FeaturesEditor({ form, onChange }: Props) {
  return (
    <div className="pt-2 space-y-4">
      <div className="text-sm font-medium text-slate-700">Features</div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.completionEnabled}
          onChange={(e) => onChange({ completionEnabled: e.target.checked })}
        />
        Completion
      </label>
      {form.completionEnabled && (
        <div className="ml-6 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div>
            <label className="text-xs font-medium text-slate-700">Completions collection</label>
            <Input
              value={form.completionCollection}
              onChange={(e) => onChange({ completionCollection: e.target.value })}
              placeholder="coneCompletions"
            />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.completionMethodTick}
                onChange={(e) => onChange({ completionMethodTick: e.target.checked })}
              />
              tick
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.completionMethodCheckin}
                onChange={(e) => onChange({ completionMethodCheckin: e.target.checked })}
              />
              checkin
            </label>
          </div>
          {form.completionMethodCheckin && (
            <div>
              <label className="text-xs font-medium text-slate-700">Check-in gate radius (m)</label>
              <Input
                value={form.completionGateRadius}
                onChange={(e) => onChange({ completionGateRadius: e.target.value })}
                placeholder="80"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700">Field: locationId</label>
              <Input
                value={form.completionFieldLocationId}
                onChange={(e) => onChange({ completionFieldLocationId: e.target.value })}
                placeholder="coneId"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Field: locationSlug</label>
              <Input
                value={form.completionFieldLocationSlug}
                onChange={(e) => onChange({ completionFieldLocationSlug: e.target.value })}
                placeholder="coneSlug"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Field: locationName</label>
              <Input
                value={form.completionFieldLocationName}
                onChange={(e) => onChange({ completionFieldLocationName: e.target.value })}
                placeholder="coneName"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">Field: shared</label>
              <Input
                value={form.completionFieldShared}
                onChange={(e) => onChange({ completionFieldShared: e.target.value })}
                placeholder="shareBonus"
              />
            </div>
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.itineraryEnabled}
          onChange={(e) => onChange({ itineraryEnabled: e.target.checked })}
        />
        Itinerary
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.pushEnabled}
          onChange={(e) => onChange({ pushEnabled: e.target.checked })}
        />
        Push
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.redemptionEnabled}
          onChange={(e) => onChange({ redemptionEnabled: e.target.checked })}
        />
        Redemption
      </label>
    </div>
  );
}
```

- [ ] **Step 4: `components/apps/LocationFieldsEditor.tsx`**

```tsx
import type { LocationFieldFormRow } from "../../models/appConfig";
import { LOCATION_FIELD_TYPES } from "../../models/appConfig";
import { Input, SecondaryButton } from "../ui/FormControls";

type Props = {
  rows: LocationFieldFormRow[];
  onChange: (rows: LocationFieldFormRow[]) => void;
};

export function LocationFieldsEditor({ rows, onChange }: Props) {
  function addRow() {
    onChange([...rows, { key: "", label: "", type: "text", required: false, options: "" }]);
  }
  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }
  function update(i: number, patch: Partial<LocationFieldFormRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-slate-700">Location fields (admin form schema)</div>
        <SecondaryButton type="button" onClick={addRow}>Add field</SecondaryButton>
      </div>

      {rows.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          No custom fields — the app falls back to the fixed Location fields.
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium text-slate-900">Field {i + 1}</div>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="text-xs rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700 hover:bg-rose-100"
                >
                  Remove
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-700">Key</label>
                  <Input value={row.key} onChange={(e) => update(i, { key: e.target.value })} placeholder="category" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700">Label</label>
                  <Input value={row.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Category" />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 items-end">
                <div>
                  <label className="text-xs font-medium text-slate-700">Type</label>
                  <select
                    value={row.type}
                    onChange={(e) => update(i, { type: e.target.value as LocationFieldFormRow["type"] })}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                  >
                    {LOCATION_FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
                  <input
                    type="checkbox"
                    checked={row.required}
                    onChange={(e) => update(i, { required: e.target.checked })}
                  />
                  Required
                </label>
              </div>

              {(row.type === "select" || row.type === "multiselect") && (
                <div className="mt-3">
                  <label className="text-xs font-medium text-slate-700">Options (comma-separated)</label>
                  <Input
                    value={row.options}
                    onChange={(e) => update(i, { options: e.target.value })}
                    placeholder="burger, pizza, asian"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: `components/apps/AppForm.tsx`**

```tsx
import type { AppFormState } from "../../models/appConfig";
import { Input, PrimaryButton, SecondaryButton } from "../ui/FormControls";
import { ThemeEditor } from "./ThemeEditor";
import { FeaturesEditor } from "./FeaturesEditor";
import { LocationFieldsEditor } from "./LocationFieldsEditor";

type Props = {
  form: AppFormState;
  isEditing: boolean;
  onChange: (patch: Partial<AppFormState>) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
};

export function AppForm({ form, isEditing, onChange, onSave, onCancel, onDelete }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
      <div>
        <label className="text-xs font-medium text-slate-700">App ID</label>
        <Input
          value={form.appId}
          onChange={(e) => onChange({ appId: e.target.value })}
          disabled={isEditing}
          placeholder="cones"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-slate-700">Name</label>
        <Input value={form.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Cones" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-700">Firebase project</label>
          <Input
            value={form.firebaseProject}
            onChange={(e) => onChange({ firebaseProject: e.target.value })}
            placeholder="cones-app-fd230"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700">R2 bucket</label>
          <Input value={form.r2Bucket} onChange={(e) => onChange({ r2Bucket: e.target.value })} placeholder="aklguide" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-700">Collection: locations</label>
          <Input
            value={form.collectionsLocations}
            onChange={(e) => onChange({ collectionsLocations: e.target.value })}
            placeholder="cones"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700">Collection: reviews</label>
          <Input
            value={form.collectionsReviews}
            onChange={(e) => onChange({ collectionsReviews: e.target.value })}
            placeholder="optional"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700">Collection: itineraries</label>
          <Input
            value={form.collectionsItineraries}
            onChange={(e) => onChange({ collectionsItineraries: e.target.value })}
            placeholder="optional"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-700">Map latitude</label>
          <Input value={form.mapLat} onChange={(e) => onChange({ mapLat: e.target.value })} placeholder="-36.8485" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700">Map longitude</label>
          <Input value={form.mapLng} onChange={(e) => onChange({ mapLng: e.target.value })} placeholder="174.7633" />
        </div>
      </div>

      <ThemeEditor rows={form.theme} onChange={(theme) => onChange({ theme })} />
      <FeaturesEditor form={form} onChange={onChange} />
      <LocationFieldsEditor rows={form.locationFields} onChange={(locationFields) => onChange({ locationFields })} />

      <div className="flex items-center justify-between pt-2">
        <div className="flex gap-2">
          <PrimaryButton type="button" onClick={onSave}>
            {isEditing ? "Save" : "Create"}
          </PrimaryButton>
          <SecondaryButton type="button" onClick={onCancel}>
            Cancel
          </SecondaryButton>
        </div>
        {isEditing && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="text-sm rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 hover:bg-rose-100"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Manual verification**

Run: `cd blacksands/registry-admin && npx tsc -b`
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
cd blacksands
git add registry-admin/src/components/
git commit -m "feat: add apps registry form components"
```

---

### Task 9: Wire `AppsPage` fully + end-to-end smoke test

**Files:**
- Modify: `registry-admin/src/pages/AppsPage.tsx` (replaces the Task 6 placeholder entirely)

**Interfaces:**
- Consumes: everything from Tasks 7 and 8.

- [ ] **Step 1: Replace `AppsPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { auth } from "../firebase";
import { listApps, getApp, createApp, updateApp, deleteApp, ApiError, type AppSummary } from "../api/appsClient";
import type { AppFormState } from "../models/appConfig";
import { emptyForm, toFormState, fromFormState } from "../lib/appAdmin";
import { AppForm } from "../components/apps/AppForm";
import { SecondaryButton } from "../components/ui/FormControls";

export default function AppsPage() {
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<AppFormState>(emptyForm);
  const [msg, setMsg] = useState("");

  async function refreshList() {
    const token = await auth.currentUser!.getIdToken();
    const { apps } = await listApps(token);
    setApps([...apps].sort((a, b) => a.appId.localeCompare(b.appId)));
    setLoading(false);
  }

  useEffect(() => {
    refreshList().catch((e) => setMsg(e instanceof Error ? e.message : "Failed to load apps"));
  }, []);

  function reset() {
    setSelectedId(null);
    setForm(emptyForm);
    setMsg("");
  }

  async function select(appId: string) {
    setMsg("");
    const token = await auth.currentUser!.getIdToken();
    try {
      const { app } = await getApp(token, appId);
      setSelectedId(appId);
      setForm(toFormState(app));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to load app");
    }
  }

  async function save() {
    setMsg("");
    const { errors, config } = fromFormState(form);
    if (errors.length > 0) {
      setMsg(errors.join(" "));
      return;
    }

    const token = await auth.currentUser!.getIdToken();
    try {
      if (selectedId) {
        const { appId: _appId, ...rest } = config!;
        await updateApp(token, selectedId, rest);
        setMsg("Saved. Live API may take up to 5 min to pick this up (KV cache TTL).");
      } else {
        await createApp(token, config!);
        setMsg("Created. Live API may take up to 5 min to pick this up (KV cache TTL).");
      }
      await refreshList();
      reset();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setMsg("That App ID is already registered.");
      else setMsg(e instanceof Error ? e.message : "Error saving");
    }
  }

  async function remove(appId: string) {
    const ok = confirm(`Delete "${appId}"? This cannot be undone.`);
    if (!ok) return;

    setMsg("");
    const token = await auth.currentUser!.getIdToken();
    try {
      await deleteApp(token, appId);
      if (selectedId === appId) reset();
      await refreshList();
      setMsg("Deleted.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error deleting");
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Apps registry</h1>
          <p className="text-sm text-slate-600 mt-1">Every white-label app config the engine resolves by appId.</p>
        </div>
        <SecondaryButton onClick={reset}>New app</SecondaryButton>
      </div>

      {msg && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">{msg}</div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2">
          {loading ? (
            <div className="text-slate-600">Loading…</div>
          ) : (
            <div className="space-y-2">
              {apps.map((a) => (
                <button
                  key={a.appId}
                  onClick={() => select(a.appId)}
                  className={[
                    "w-full text-left rounded-2xl border p-3",
                    selectedId === a.appId
                      ? "border-indigo-400 bg-indigo-50"
                      : "border-slate-200 bg-white hover:bg-slate-50",
                  ].join(" ")}
                >
                  <div className="font-medium text-slate-900">{a.name}</div>
                  <div className="text-xs text-slate-500 font-mono">{a.appId}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-3">
          <AppForm
            form={form}
            isEditing={selectedId !== null}
            onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            onSave={save}
            onCancel={reset}
            onDelete={selectedId ? () => remove(selectedId) : undefined}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `cd blacksands/registry-admin && npx tsc -b`
Expected: no type errors.

- [ ] **Step 3: Manual end-to-end smoke test**

Run: `cd blacksands/registry-admin && npm run dev`, open the printed local URL, sign in.

1. Click "New app". Fill: App ID `smoke-test-app`, Name `Smoke Test`, Firebase project `smoke-test-proj`, R2 bucket `aklguide`, Collection: locations `locations`. Add one theme row (`primary` / `#111111`). Set map lat/lng to `-36.8` / `174.7`. Add one location field (key `category`, label `Category`, type `select`, options `a, b, c`). Click Create.
   Expected: success message, list refreshes and shows `smoke-test-app`.
2. Click `smoke-test-app` in the list, change Name to `Smoke Test Updated`, click Save.
   Expected: success message; re-selecting it shows the updated name.
3. Try creating another app with App ID `smoke-test-app` again.
   Expected: "That App ID is already registered."
4. Click `smoke-test-app`, click Delete, confirm.
   Expected: success message, list no longer shows it.
5. Cross-check step 1–4 actually hit real Firestore (not just the UI's own state) by running the existing verification script from `blacksands/scripts`:
   `node blacksands/scripts/firebase-collection-to-json.js` (or however that script is invoked — check its own usage comment) against the `apps` collection on `blacksands-a37aa`, confirming `smoke-test-app` is absent (already deleted) and the other 4 real apps are untouched.

- [ ] **Step 4: Commit**

```bash
cd blacksands
git add registry-admin/src/pages/AppsPage.tsx
git commit -m "feat: wire up full apps registry CRUD UI"
```

---

## Self-Review

**Spec coverage:** Backend — `GET/:appId`, `POST`, `PUT`, `DELETE` (Tasks 2–5), shared `locationFields` validation extraction (Task 1), `appId` never stored as a field (enforced in Tasks 2–5's handlers and asserted in Task 3/4's tests). Frontend — every field in the spec's field table has a control (Task 8's `AppForm`/`ThemeEditor`/`FeaturesEditor`/`LocationFieldsEditor`), auth gate without Firestore access (Task 6), KV-cache note after save (Task 9), error handling for 404/409/401 (Tasks 3–5 backend, Task 9 frontend `save`/`select`/`remove`). Testing section — backend TDD via existing harness (Tasks 1–5), frontend manual smoke test (Task 9, Step 3) using the exact script the spec named.

**Placeholder scan:** No TBD/TODO markers; every step has runnable commands or complete file contents; no "similar to Task N" shorthand — each task's code is written out in full even where it resembles an earlier one.

**Type consistency:** `AppFormState`/`ThemeRow`/`LocationFieldFormRow` defined once in Task 7's `models/appConfig.ts`, imported (never redefined) by Task 8's components and Task 9's `AppsPage`. `AppConfig`/`LocationFieldSchema`/`CompletionConfig` mirror `enginev1/api/src/types.ts` field-for-field (checked against the actual file during planning). `ApiError`/`request` defined once in Task 6's `appsClient.ts`, extended (not redefined) in Task 7.

Two backend-shape checks worth restating since they came from reading the actual precondition-failure and error-handling code rather than assuming it: the global `app.onError` handler in `enginev1/api/src/index.ts` flattens any uncaught error to a generic 500, which is why Task 3's `POST` handler explicitly `try/catch`es `FirestoreAdminError` for the 409 case; and Tasks 4/5 use a `getDoc`-first check rather than relying on `commit()`'s `currentDocument.exists:true` precondition-failure status code, since no existing route in this codebase relies on that behavior and it isn't verified.

---

## Execution Handoff

Plan complete and saved to `blacksands/plans/2026-08-03-apps-registry-admin.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
