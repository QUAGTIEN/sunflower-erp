const guards = new Set<() => boolean>();

/** Register only while a form has unsaved input or a request in flight. */
export function registerNavigationGuard(guard: () => boolean) {
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
}

export function confirmAppNavigation() {
  return [...guards].every(guard => guard());
}
