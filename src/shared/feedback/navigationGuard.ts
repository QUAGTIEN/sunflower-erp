interface NavigationGuard {
  confirmLeave: () => boolean;
  discard?: () => void;
}

const guards = new Set<NavigationGuard>();

/**
 * Register only while a form has unsaved input or a request in flight. Pages stay mounted when hidden, so a form
 * that keeps its unsaved input after the user agreed to leave would ask again on every later navigation; `discard`
 * drops that input once every guard has agreed.
 */
export function registerNavigationGuard(confirmLeave: () => boolean, discard?: () => void) {
  const guard = { confirmLeave, discard };
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
}

export function confirmAppNavigation() {
  const active = [...guards];
  if (!active.every(guard => guard.confirmLeave())) return false;
  active.forEach(guard => guard.discard?.());
  return true;
}
