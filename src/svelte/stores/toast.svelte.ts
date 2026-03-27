let message = $state('');
let type = $state<'error' | 'success' | 'info'>('error');
let visible = $state(false);
let timer: ReturnType<typeof setTimeout> | undefined;

export function getToastState() {
  return {
    get message() {
      return message;
    },
    get type() {
      return type;
    },
    get visible() {
      return visible;
    },
  };
}

export function showToast(msg: string, toastType: 'error' | 'success' | 'info' = 'error', duration = 3000) {
  if (timer) clearTimeout(timer);
  message = msg;
  type = toastType;
  visible = true;
  timer = setTimeout(() => {
    visible = false;
  }, duration);
}

export function dismissToast() {
  if (timer) clearTimeout(timer);
  visible = false;
}
