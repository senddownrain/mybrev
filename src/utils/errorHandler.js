import { logger } from '@/utils/logger';
import { useNotifier } from '@/composables/useNotifier';

export function handleFirestoreError(error, context = '') {
  logger.error(`[${context}] Firestore error:`, error);
  
  const { notifyError } = useNotifier();
  
  let message = 'Памылка захавання даных';
  
  if (error.code === 'permission-denied') {
    message = 'Няма доступу для выканання гэтай аперацыі';
  } else if (error.code === 'unavailable') {
    message = 'Сэрвіс часова недаступны. Паспрабуйце пазней';
  } else if (error.code === 'deadline-exceeded') {
    message = 'Час выканання аперацыі скончыўся. Паспрабуйце яшчэ раз';
  } else if (error.message) {
    message = error.message;
  }
  
  notifyError(message);
  return message;
}

export function handleError(error, context = '', userMessage = null) {
  logger.error(`[${context}] Error:`, error);
  
  const { notifyError } = useNotifier();
  const message = userMessage || error.message || 'Адбылася памылка';
  notifyError(message);
  
  return message;
}

export function handleValidationError(validationResult) {
  const { notifyError } = useNotifier();
  if (validationResult !== true) {
    notifyError(validationResult);
    return true;
  }
  return false;
}

