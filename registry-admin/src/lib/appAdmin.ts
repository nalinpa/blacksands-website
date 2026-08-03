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
  const collections = app.collections ?? { locations: "" };
  const theme = app.theme ?? {};
  const center = app.map?.center ?? [0, 0];
  const features = app.features ?? {
    completion: { enabled: false },
    itinerary: { enabled: false },
    push: { enabled: false },
    redemption: { enabled: false },
  };
  const completion = features.completion;
  return {
    appId: app.appId,
    name: app.name,
    firebaseProject: app.firebaseProject,
    r2Bucket: app.r2Bucket,
    collectionsLocations: collections.locations,
    collectionsReviews: collections.reviews ?? "",
    collectionsItineraries: collections.itineraries ?? "",
    theme: Object.entries(theme).map(([key, value]) => ({ key, value })),
    mapLat: String(center[0]),
    mapLng: String(center[1]),
    completionEnabled: completion.enabled,
    completionCollection: completion.enabled ? completion.collection : "",
    completionMethodTick: completion.enabled ? (completion.methods ?? []).includes("tick") : false,
    completionMethodCheckin: completion.enabled ? (completion.methods ?? []).includes("checkin") : false,
    completionGateRadius: completion.enabled ? String(completion.checkin?.gateRadius ?? 80) : "80",
    completionFieldLocationId: completion.enabled ? completion.fields.locationId : "",
    completionFieldLocationSlug: completion.enabled ? completion.fields.locationSlug : "",
    completionFieldLocationName: completion.enabled ? completion.fields.locationName : "",
    completionFieldShared: completion.enabled ? completion.fields.shared : "",
    itineraryEnabled: features.itinerary.enabled,
    pushEnabled: features.push.enabled,
    redemptionEnabled: features.redemption.enabled,
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
      locationFields,
      features: {
        completion,
        itinerary: { enabled: form.itineraryEnabled },
        push: { enabled: form.pushEnabled },
        redemption: { enabled: form.redemptionEnabled },
      },
    },
  };
}
