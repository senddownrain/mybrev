import { prayerMarkdownToPlainText, validatePrayerMarkdown } from '@/utils/prayerMarkdown';

export function validatePrayerTitle(title) {
  if (!title || !title.trim()) {
    return 'Назва абавязковая';
  }
  if (title.length > 200) {
    return 'Назва не павінна перавышаць 200 сімвалаў';
  }
  return true;
}

export function validatePrayerText(text) {
  if (!text || !text.trim()) {
    return 'Тэкст малітвы абавязковы';
  }
  const textWithoutMarkup = prayerMarkdownToPlainText(text);
  if (textWithoutMarkup.length < 10) {
    return 'Тэкст павінен быць не менш за 10 сімвалаў';
  }
  const markdownErrors = validatePrayerMarkdown(text);
  if (markdownErrors.length) {
    return `Радок ${markdownErrors[0].line}: ${markdownErrors[0].message}`;
  }
  return true;
}

export function validateCategory(category) {
  if (!category || !category.name || !category.name.trim()) {
    return 'Назва катэгорыі абавязковая';
  }
  if (category.tags != null && !Array.isArray(category.tags)) {
    return 'Некарэктны спіс тэгаў';
  }
  return true;
}

export function validateEmail(email) {
  if (!email || !email.trim()) {
    return 'Email абавязковы';
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return 'Няправільны фармат email';
  }
  return true;
}

export function validatePassword(password) {
  if (!password || !password.trim()) {
    return 'Пароль абавязковы';
  }
  if (password.length < 6) {
    return 'Пароль павінен быць не менш за 6 сімвалаў';
  }
  return true;
}

