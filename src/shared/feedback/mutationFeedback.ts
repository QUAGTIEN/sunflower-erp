export interface ToastMessage {
  id: number;
  text: string;
  detail: string;
  tone: 'success' | 'info' | 'error';
}

const listeners = new Set<() => void>();
let current: ToastMessage | null = null;
let sequence = 0;
let timeout: ReturnType<typeof setTimeout> | undefined;
const pendingActions = new Set<string>();

export const getToastSnapshot = () => current;
export const subscribeToToast = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const dismissToast = () => {
  clearTimeout(timeout);
  timeout = undefined;
  current = null;
  listeners.forEach(listener => listener());
};

const showToast = (text: string, tone: ToastMessage['tone'], detail = '') => {
  clearTimeout(timeout);
  current = { id: ++sequence, text: text.replace(/\s+/g, ' ').trim(), detail, tone };
  listeners.forEach(listener => listener());
  timeout = setTimeout(dismissToast, 3000);
};

export const showSuccessToast = (text = 'Đã lưu thành công', detail?: string) => {
  const isAdded = /^Đã (thêm|tạo)/i.test(text);
  const description =
    detail ??
    (isAdded
      ? 'Dữ liệu mới đã được tạo trong hệ thống.'
      : /^Đã xóa/i.test(text)
        ? 'Thao tác xóa đã được thực hiện thành công.'
        : /^Đã lưu/i.test(text)
          ? 'Dữ liệu đã được lưu vào hệ thống.'
          : 'Thao tác đã được thực hiện thành công.');
  showToast(text, isAdded ? 'info' : 'success', description);
};
export const showErrorToast = (text = 'Không thể lưu. Vui lòng thử lại.') =>
  showToast('Không thể hoàn tất', 'error', text);

export const requireConfirmedMutation = async <Result>(operation: Promise<Result>): Promise<Result> => {
  const result = await operation;
  if (result === false) throw new Error('Không thể lưu thay đổi.');
  return result;
};

const getActionButton = (firstArgument: unknown): HTMLButtonElement | null => {
  if (typeof document === 'undefined') return null;
  const event = firstArgument as { currentTarget?: unknown; nativeEvent?: { submitter?: unknown } } | null;
  const target = event?.nativeEvent?.submitter || event?.currentTarget;
  if (target instanceof HTMLButtonElement) return target;
  if (
    target instanceof HTMLFormElement &&
    document.activeElement instanceof HTMLButtonElement &&
    document.activeElement.form === target
  )
    return document.activeElement;
  if (event?.currentTarget instanceof Element) return null;
  return document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
};

/** Wrap explicit UI actions, while keeping success feedback at their confirmed commit point. */
export const runMutationAction = async <Result>(
  key: string,
  action: () => Promise<Result>,
  trigger?: unknown,
  options: { busy?: boolean } = {}
): Promise<Result | undefined> => {
  const event = trigger as { preventDefault?: () => void } | undefined;
  if (typeof event?.preventDefault === 'function') event.preventDefault();
  const guardSubmission = options.busy !== false;
  if (guardSubmission && pendingActions.has(key)) return;
  const candidate = options.busy === false ? null : getActionButton(trigger);
  // Nested saves share their outer action's button and must not unlock it early.
  const button = candidate?.dataset.mutationPending ? null : candidate;
  const wasDisabled = button?.disabled || false;
  const previousBusy = button?.getAttribute('aria-busy');
  if (guardSubmission) pendingActions.add(key);
  if (button) {
    button.disabled = true;
    button.dataset.mutationPending = 'true';
    button.setAttribute('aria-busy', 'true');
  }
  try {
    return await action();
  } catch (error) {
    showErrorToast();
    throw error;
  } finally {
    if (guardSubmission) pendingActions.delete(key);
    if (button) {
      button.disabled = wasDisabled;
      delete button.dataset.mutationPending;
      if (previousBusy === null || previousBusy === undefined) button.removeAttribute('aria-busy');
      else button.setAttribute('aria-busy', previousBusy);
    }
  }
};

export const withMutationFeedback =
  <Args extends unknown[], Result>(
    key: string,
    action: (...args: Args) => Promise<Result>,
    options: { busy?: boolean } = {}
  ) =>
  (...args: Args) =>
    runMutationAction(key, () => action(...args), args[0], options);
