export interface DeleteConfirmation {
  id: number;
  message: string;
  title: string;
  confirmLabel: string;
}

const listeners = new Set<() => void>();
const queue: Array<{ request: DeleteConfirmation; resolve: (confirmed: boolean) => void }> = [];
let sequence = 0;
let current: DeleteConfirmation | null = null;
const publish = () => {
  current = queue[0]?.request ?? null;
  listeners.forEach(listener => listener());
};

export const getDeleteConfirmationSnapshot = () => current;
export const subscribeToDeleteConfirmation = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Await consent before running a destructive action; concurrent requests never overwrite one another. */
export const confirmDelete = (
  message: string,
  options: { title?: string; confirmLabel?: string } = {}
): Promise<boolean> =>
  new Promise(resolve => {
    queue.push({
      request: {
        id: ++sequence,
        message,
        title: options.title ?? 'Xác nhận xóa',
        confirmLabel: options.confirmLabel ?? 'Xóa'
      },
      resolve
    });
    publish();
  });

export const resolveDeleteConfirmation = (id: number, confirmed: boolean) => {
  if (queue[0]?.request.id !== id) return;
  const entry = queue.shift();
  publish();
  entry?.resolve(confirmed);
};

export const cancelDeleteConfirmations = () => {
  const pending = queue.splice(0);
  publish();
  pending.forEach(entry => entry.resolve(false));
};
