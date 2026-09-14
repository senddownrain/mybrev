export const TAGS_LIST = [
  { id: 1, title: 'Да Духа', icon: 'icon-fire' },
  { id: 2, title: 'Эўхарыстычныя', icon: 'icon-eucharist' },
  { id: 3, title: 'Праслаўленне', icon: 'icon-glorification' },
  { id: 4, title: 'Пакланенне', icon: 'icon-worship' },
  { id: 5, title: 'Пілігрымкавыя', icon: 'icon-pilgrim' },
  { id: 6, title: 'Марыйныя', icon: 'icon-maria' },
  { id: 7, title: 'Калядныя', icon: 'icon-christmas' },
  { id: 8, title: 'Постныя', icon: 'icon-fasting' },
  { id: 9, title: 'Велікодныя', icon: 'icon-easter' },
  { id: 10, title: 'Часткі Імшы', icon: 'icon-eucharist' },
];

export function songCategoryIds(tag) {
  const values = Array.isArray(tag) ? tag : String(tag ?? '').split(',');
  return [...new Set(values.map(Number).filter((id) => TAGS_LIST.some((item) => item.id === id)))];
}

export function getSongTags(song = {}) {
  return [...new Set([
    ...songCategoryIds(song.tag).map((id) => TAGS_LIST.find((item) => item.id === id).title),
    ...(Array.isArray(song.tags) ? song.tags : []),
  ])];
}

export const SONGS_CACHE_VERSION = 4;
