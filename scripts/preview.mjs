import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { renderCard, parseReference, buildEmbed, replaceEmbed } from '../src/index.mjs';
import { readEditions, translationEdition } from '../src/sources.mjs';

const selected = parseReference('94:5');
const edition = translationEdition();
const source = await readEditions(edition);
function sample(ref) {
  const arabic = source.arabic.get(ref), english = source.translations.get(ref);
  if (!arabic || !english) throw new Error(`Tanzil did not provide ${ref}.`);
  return { ...parseReference(ref), arabic, english, arabicNotice: source.notice,
    translationName: edition.credit };
}
const short = sample('94:5');
await mkdir('assets', { recursive: true });
const previews = {};
for (const [name, options] of Object.entries({
  light: { theme: 'light' }, dark: { theme: 'dark' },
  'transparent-light': { theme: 'light', bg: 'transparent' },
  'transparent-dark': { theme: 'dark', bg: 'transparent' },
  'arabic-only-light': { theme: 'light', showTranslation: false },
  'arabic-only-dark': { theme: 'dark', showTranslation: false },
  'green-gold': { theme: 'dark', palette: 'green-gold' }
})) {
  const svg = renderCard({ ...short, ...options });
  previews[name] = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  await writeFile(`assets/preview-${name}.svg`, svg);
  if (name === 'light' || name === 'dark') await writeFile(`assets/ayah-${name}.svg`, svg);
}
for (const ref of ['2:255', '2:282']) {
  const name = ref.replace(':', '-');
  const svg = renderCard({ ...sample(ref), theme: 'light', animate: false });
  previews[name] = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  await writeFile(`assets/preview-${name}.svg`, svg);
}
await writeFile('assets/quran-ayah.svg', renderCard(short));
const template = await readFile(new URL('./preview-template.html', import.meta.url), 'utf8');
await writeFile('preview.html', template.replaceAll(/assets\/preview-([\w-]+)\.svg/g, (_, name) => previews[name]));
const embed = buildEmbed({ light: 'assets/ayah-light.svg', dark: 'assets/ayah-dark.svg', verseUrl: 'https://quran.com/94/5',
  reference: '94:5', surah: selected.surah, edition });
await writeFile('README.md', replaceEmbed(await readFile('README.md', 'utf8'), embed));
console.log('Open preview.html to compare the banner styles. Reload to replay the pen strokes and typing.');
