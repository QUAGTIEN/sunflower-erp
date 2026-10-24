/**
 * A document as stored in Firestore or the local fallback store.
 *
 * Collections are schemaless at the data-adapter boundary, so the adapter cannot know field types and
 * callers assign results straight to their own model types. This alias is the single, deliberate escape
 * hatch for that boundary; replace usages with real model types feature by feature instead of adding
 * new `any`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ErpDocument = any;
