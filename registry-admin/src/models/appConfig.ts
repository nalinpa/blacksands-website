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
