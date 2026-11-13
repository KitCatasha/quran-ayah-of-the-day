import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildEmbed, generateCard, parseReference, renderCard, replaceEmbed, selectVerse, wrapWords } from '../src/index.mjs';
import { parseTanzil, readEditions, translationEdition, TANZIL_ARABIC } from '../src/sources.mjs';

test('daily selection is stable throughout a UTC day', () => {
  const morning = selectVerse(new Date('2026-10-05T00:01:00Z'));
  const evening = selectVerse(new Date('2026-10-05T23:59:00Z'));
  assert.deepEqual(morning, evening);
  assert.notDeepEqual(morning, selectVerse(new Date('2026-10-06T00:01:00Z')));
  assert.throws(() => selectVerse(new Date('invalid')), /Invalid date/);
});

test('fixed references work outside the curated rotation and respect chapter bounds', () => {
  assert.deepEqual(parseReference('94:5'), { chapter: 94, verse: 5, surah: 'Ash-Sharh' });
  assert.throws(() => parseReference('not-a-reference'), /Invalid verse reference/);
  assert.equal(parseReference('2:282').verse, 282);
  assert.equal(parseReference('1:1').chapter, 1);
  assert.throws(() => parseReference('2:287'), /chapter bounds/);
});

test('word wrapping preserves all words in order', () => {
  const text = 'With hardship comes ease and with patience comes strength';
  const lines = wrapWords(text, 18);
  assert.equal(lines.join(' '), text);
  assert.ok(lines.length > 1);
});

test('Tanzil downloads are verbatim and incomplete downloads fail closed', async () => {
  const raw = '94|5|With hardship comes ease.\r\n# notice';
  assert.equal(parseTanzil(raw).get('94:5'), 'With hardship comes ease.');
  assert.throws(() => parseTanzil('<html>error</html>'), /Tanzil/);
  await assert.rejects(readEditions(null, async () => raw), /incomplete/);
  assert.equal(translationEdition('', 'id').id, 'id.indonesian');
  assert.equal(translationEdition().id, 'en.sahih');
  assert.equal(translationEdition('itani').id, 'en.itani');
  assert.equal(translationEdition('sahih', 'de').lang, 'en');
  assert.throws(() => translationEdition('../unsafe-edition'), /Tanzil translation ID/);
});

test('SVG output escapes content and includes accessible metadata', () => {
  const svg = renderCard({
    arabic: 'فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا',
    english: 'Ease & mercy <always>',
    surah: 'Ash-Sharh', chapter: 94, verse: 5,
    title: "Qur'an Ayah of the Day", translationName: 'Example', theme: 'forest'
  });
  assert.match(svg, /<title id="card-title">/);
  assert.match(svg, /Ease &amp; mercy &lt;always&gt;/);
  assert.doesNotMatch(svg, /<always>/);
  assert.match(svg, /<path [^>]*transform=/);
  assert.doesNotMatch(svg, /linearGradient|radialGradient|<pattern|Generated with/);
  assert.match(svg, /width="100%" viewBox="0 0 640 \d+"/);
  assert.match(svg, /src:url\(data:font\/woff;base64,/);
  assert.doesNotMatch(svg, /<script|<image|url\(https?:|font-family="monospace"/);
});

const sample = { arabic: 'فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا', english: 'For indeed, with hardship [will be] ease.', surah: 'Ash-Sharh', chapter: 94, verse: 5 };
const readTypingClips = svg => [...svg.matchAll(/<clipPath id="(ayah-type-line-\d+)"[^>]*><rect x="0" y="0" width="(\d+)"[^>]*><animate attributeName="width" calcMode="discrete" dur="(\d+)ms" keyTimes="([^"]+)" values="([^"]+)" fill="remove"/g)]
  .map(([, id, fullWidth, duration, keyTimes, values]) => ({
    id, fullWidth: Number(fullWidth), duration: Number(duration), times: keyTimes.split(';').map(Number), widths: values.split(';').map(Number)
  }));
test('short banners reveal solid Arabic ink and type an intact translation on the same clock', () => {
  const svg = renderCard(sample);
  const height = Number(svg.match(/viewBox="0 0 640 (\d+)"/)[1]);
  assert.ok(height >= 116 && height <= 130, `Expected a compact banner with bottom padding, got ${height}`);
  assert.match(svg, /prefers-reduced-motion:no-preference/);
  assert.match(svg, /<g class="ink ayah-words"/);
  assert.match(svg, /stroke-dashoffset:1/);
  const strokes = [...svg.matchAll(/<path class="ayah-ink-guide"[^>]*--ayah-start:(\d+)ms;--ayah-duration:(\d+)ms/g)]
    .map(([, start, duration]) => ({ start: Number(start), end: Number(start) + Number(duration) }))
    .sort((a, b) => a.start - b.start);
  assert.ok(strokes.length > 10);
  assert.equal(strokes[0].start, 0);
  assert.ok(strokes.slice(1).every((stroke, i) => stroke.start < strokes[i].end));
  assert.equal(Math.max(...strokes.map(stroke => stroke.end)), 5000);
  assert.ok(svg.includes(`aria-label="${sample.english}"`));
  const [typing] = readTypingClips(svg);
  assert.equal(typing.duration, 5000);
  assert.equal(typing.times.length, sample.english.replaceAll(' ', '').length + 1);
  assert.equal(typing.times[0], 0);
  assert.equal(typing.times.at(-1), 1);
  assert.equal(typing.widths[0], 0);
  assert.equal(typing.widths.at(-1), typing.fullWidth);
  assert.ok(typing.widths.every((width, i) => !i || width > typing.widths[i - 1]));
  assert.doesNotMatch(svg, /ayah-type-glyph/);
  assert.match(svg, /prefers-reduced-motion:reduce\)\{\.ayah-type-line\{clip-path:none\}\}/);
  const letters = svg.match(/<g class="ink ayah-words"[^>]*>(.*?)<\/g>/s)[1];
  assert.match(letters, /mask="url\(#ayah-ink-\d+\)"/);
  assert.doesNotMatch(letters, /stroke=|fill-opacity/);
  const guide = svg.match(/<path class="ayah-ink-guide"[^>]* d="([^"]+)"/)[1];
  const glyph = letters.match(/<path mask="url\(#ayah-ink-0\)"[^>]* d="([^"]+)"/)[1];
  assert.notEqual(guide, glyph, 'The guide must follow the inside rather than the outline');
  assert.match(svg, /ayah-ink-complete var\(--ayah-duration\) linear/);
  assert.doesNotMatch(svg, /infinite|<script|visibility:hidden|<tspan/);
  assert.doesNotMatch(renderCard({ ...sample, animate: false }), /@keyframes|<clipPath|<mask/);
});
test('attribution stays in accessible metadata but not on the banner face', () => {
  const credit = 'Example translation credit';
  const svg = renderCard({ ...sample, translationName: credit });
  assert.ok(svg.match(/<desc[^>]*>([^<]*)<\/desc>/)[1].includes(credit));
  assert.doesNotMatch(svg, /aria-label="Example translation credit"/);
  assert.doesNotMatch(svg, /aria-label="Saheeh International"/);
  assert.match(svg, /aria-label="Ash-Sharh · 94:5"/);
});
test('wrapped translation keeps every word, space, and punctuation mark', () => {
  const english = `${sample.english} Indeed, the complete sentence should remain visible in every theme.`;
  const svg = renderCard({ ...sample, english, width: 320 });
  const lines = [...svg.matchAll(/<g class="ink ayah-translation"[^>]*aria-label="([^"]+)"/g)].map(m => m[1]);
  assert.ok(lines.length > 1);
  assert.equal(lines.join(' '), english);
  const visibleGlyphs = card => [...card.matchAll(/<g class="ink ayah-translation"[^>]*>(.*?)<\/g>/g)]
    .map(([, svg]) => svg.match(/<path[^>]+\/>/g));
  const staticCard = renderCard({ ...sample, english, width: 320, animate: false });
  assert.deepEqual(visibleGlyphs(svg), visibleGlyphs(staticCard));
  const clips = readTypingClips(svg);
  assert.equal(clips.length, lines.length);
  for (const [i, clip] of clips.entries()) {
    assert.equal(clip.widths.length, clip.times.length);
    assert.ok(clip.times.every((time, j) => !j || time > clip.times[j - 1]));
    assert.ok(clip.widths.every((width, j) => !j || width >= clip.widths[j - 1]));
    assert.equal(clip.widths.at(-1), clip.fullWidth);
    assert.match(svg, new RegExp(`clip-path="url\\(#${clip.id}\\)"`));
    if (i) assert.ok(clip.times[1] > clips[i - 1].times.at(-2), 'Typing must continue on the next line only after the prior line');
  }
  assert.equal(clips.at(-1).times.at(-1), 1);
});
test('automatic theme, transparent and Arabic-only options', () => {
  assert.match(renderCard(sample), /prefers-color-scheme:dark/);
  const svg = renderCard({ ...sample, theme: 'light', bg: 'transparent', showTranslation: false });
  assert.doesNotMatch(svg, /<rect class="paper|For indeed|<line/);
  assert.match(svg, /فَإِنَّ/);
  assert.throws(() => renderCard({ ...sample, width: 1 }), /Width/);
  assert.throws(() => renderCard({ ...sample, theme: 'invalid' }), /theme/);
  assert.throws(() => renderCard({ ...sample, bg: 'transparent' }), /explicit light or dark/);
  const dark = renderCard({ ...sample, theme: 'dark', bg: 'transparent' });
  assert.match(dark, /\.ink\{fill:#edf1f6;/);
  assert.doesNotMatch(dark, /<rect class="paper|prefers-color-scheme/);
});
test('long ayahs expand vertically instead of clipping', () => {
  const svg = renderCard({ ...sample, arabic: Array(20).fill(sample.arabic).join(' ') });
  assert.ok(Number(svg.match(/viewBox="0 0 640 (\d+)"/)[1]) > 144);
});

test('theme pair, verse link, alt text and credit update only the README markers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ayah-test-'));
  const readmePath = join(dir, 'README.md');
  const outputPath = join(dir, 'images', 'light.svg');
  const darkOutputPath = join(dir, 'images', 'dark.svg');
  const before = '# My profile\n\n<!-- ayah-of-the-day:start -->\nold\n<!-- ayah-of-the-day:end -->\n\n## Projects\n';
  await writeFile(readmePath, before);
  const arabicText = Array.from({ length: 6235 }, (_, i) => `1|${i + 1}|${sample.arabic}`).join('\n') + `\n94|5|${sample.arabic}`;
  const urls = [];
  const requester = async url => { urls.push(url); return url === TANZIL_ARABIC ? arabicText : `94|5|${sample.english}`; };
  const result = await generateCard({ fixedReference: '94:5', outputPath, darkOutputPath, readmePath, requester, maxLength: 1 });
  assert.deepEqual(urls, [TANZIL_ARABIC, 'https://tanzil.net/trans/en.sahih']);
  assert.equal(result.verseUrl, 'https://quran.com/94/5');
  const readme = await readFile(readmePath, 'utf8');
  assert.equal(readme, replaceEmbed(before, result.embed));
  assert.match(readme, /^# My profile[\s\S]*<a href="https:\/\/quran.com\/94\/5"><picture>[\s\S]*images\/dark.svg[\s\S]*width="100%"[\s\S]*## Projects\n$/);
  assert.match(readme, /<sub><a href="https:\/\/tanzil\.net\/">Tanzil Project<\/a> · <a href="https:\/\/tanzil\.net\/trans\/">Saheeh International<\/a><\/sub>/);
  assert.match(await readFile(outputPath, 'utf8'), /\.paper\{fill:#fbfaf6/);
  assert.match(await readFile(darkOutputPath, 'utf8'), /\.paper\{fill:#0d1117/);
  assert.throws(() => replaceEmbed('<!-- ayah-of-the-day:start -->', result.embed), /markers/);
  assert.match(buildEmbed({ light: 'a path.svg', reference: '94:5', surah: 'Ash-Sharh', verseUrl: result.verseUrl }), /a%20path.svg/);
  await assert.rejects(generateCard({ outputPath, darkOutputPath, readmePath, requester, maxLength: 1 }), /No curated ayahs/);
  assert.equal(await readFile(readmePath, 'utf8'), readme);
});
