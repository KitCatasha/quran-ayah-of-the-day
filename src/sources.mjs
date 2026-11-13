export const TANZIL_ARABIC = 'https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=txt-2';
export const TANZIL_NOTICE = 'Tanzil Quran Text (Uthmani, Version 1.1) · © Tanzil Project · CC BY 3.0 · https://tanzil.net/docs/Text_License';

export const DEFAULT_ENGLISH_EDITION = { id: 'en.sahih', name: 'Saheeh International', credit: 'Saheeh International via Tanzil', url: 'https://tanzil.net/trans/', lang: 'en' };

const editions = {
  en: DEFAULT_ENGLISH_EDITION,
  id: { id: 'id.indonesian', name: 'Indonesian Ministry of Religious Affairs', credit: 'Indonesian Ministry of Religious Affairs via Tanzil', url: 'https://tanzil.net/trans/' },
  de: { id: 'de.bubenheim', name: 'Bubenheim & Elyas', credit: 'Bubenheim & Elyas via Tanzil', url: 'https://tanzil.net/trans/' },
};
const known = {
  'en.itani': { name: 'Talal Itani', credit: 'Translation by Talal Itani, ClearQuran.com', url: 'https://clearquran.com', lang: 'en' },
  'en.sahih': DEFAULT_ENGLISH_EDITION,
  'en.pickthall': { name: 'M. M. Pickthall', credit: 'M. M. Pickthall via Tanzil', url: 'https://tanzil.net/trans/', lang: 'en' },
  'id.indonesian': { ...editions.id, lang: 'id' },
  'de.bubenheim': { ...editions.de, lang: 'de' },
};
const aliases = { sahih: 'en.sahih', pickthall: 'en.pickthall', itani: 'en.itani', clearquran: 'en.itani', 'clear-quran': 'en.itani' };

export function translationEdition(translation = '', lang = 'en', name = '') {
  const id = translation ? (Object.hasOwn(aliases, translation) ? aliases[translation] : translation) : editions[lang]?.id;
  if (!id) throw new Error('Choose en, id or de, or specify a Tanzil translation ID and translation-name.');
  if (!/^[a-z]{2,3}\.[a-z0-9_.-]+$/.test(id)) throw new Error('Use a Tanzil translation ID, for example en.sahih.');
  const entry = Object.hasOwn(known, id) ? known[id] : null;
  if (!entry && !name) throw new Error('Supply translation-name when using a custom Tanzil edition.');
  return { ...(entry || { name, credit: name, url: 'https://tanzil.net/trans/', lang: id.split('.')[0] }), id, name: name || entry?.name, ...(name ? { credit: name } : {}) };
}

export async function downloadText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Tanzil download returned HTTP ${response.status}: ${url}`);
  return response.text();
}

export function parseTanzil(text) {
  const records = new Map();
  for (const line of text.split(/\r?\n/)) {
    const record = /^(\d+)\|(\d+)\|(.+)$/.exec(line);
    if (record) records.set(`${record[1]}:${record[2]}`, record[3]);
  }
  if (!records.size) throw new Error('The source did not return a Tanzil chapter|verse|text file.');
  return records;
}

export async function readEditions(edition, requester = downloadText) {
  const [arabicText, translationText] = await Promise.all([
    requester(TANZIL_ARABIC),
    edition ? requester(`https://tanzil.net/trans/${edition.id}`) : ''
  ]);
  const arabic = parseTanzil(arabicText);
  if (arabic.size !== 6236) throw new Error('The Tanzil Arabic download is incomplete; refusing to publish.');
  const noticeStart = arabicText.indexOf('# PLEASE DO NOT REMOVE OR CHANGE THIS COPYRIGHT BLOCK');
  return { arabic, translations: edition ? parseTanzil(translationText) : null,
    notice: noticeStart < 0 ? TANZIL_NOTICE : arabicText.slice(noticeStart).trimEnd() };
}
