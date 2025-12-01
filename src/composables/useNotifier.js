import { ref } from 'vue';

const snackbar = ref({
  show: false,
  text: '',
  color: 'info',
  timeout: 4000,
});

export function useNotifier() {
  const notify = (text, color = 'info', timeout = 4000) => {
    snackbar.value = {
      show: true,
      text,
      color,
      timeout,
    };
  };

  const success = (text, timeout = 4000) => {
    notify(text, 'success', timeout);
  };

  const error = (text, timeout = 6000) => {
    notify(text, 'error', timeout);
  };

  const warning = (text, timeout = 5000) => {
    notify(text, 'warning', timeout);
  };

  const info = (text, timeout = 4000) => {
    notify(text, 'info', timeout);
  };

  return {
    snackbar,
    notify,
    success,
    error,
    warning,
    info,
  };
}

