import { logger } from '@/utils/logger';
import { useNotifier } from '@/composables/useNotifier';
import { firestoreErrorCode, firestoreErrorMessage, noteFirestoreError } from './firestoreErrors.mjs';

export function handleFirestoreError(error, context = '') {
  noteFirestoreError(error);
  logger.error(`[${context}] Firestore error:`, { code: firestoreErrorCode(error) });
  
  const { notifyError } = useNotifier();
  
  const message = firestoreErrorMessage(error);
  
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

