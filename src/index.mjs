import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import { openSync } from 'fontkit';
import verses from './verses.json' with { type: 'json' };
import chapters from './chapters.json' with { type: 'json' };
import { DEFAULT_ENGLISH_EDITION, readEditions, TANZIL_NOTICE, translationEdition } from './sources.mjs';

const arabicFont = openSync(fileURLToPath(new URL('../fonts/AmiriQuran-Regular.ttf', import.meta.url)));
const serifFont = openSync(fileURLToPath(new URL('../fonts/LiberationSerif-Italic.ttf', import.meta.url)));
const arabicSubset = readFileSync(new URL('../fonts/AmiriQuran-Subset.woff', import.meta.url)).toString('base64');
const fontLicense = readFileSync(new URL('../fonts/AmiriQuran-OFL.txt', import.meta.url), 'utf8').trim();
export const DEFAULT_WIDTH = 640;
const WORD_ANIMATION = `
@media(prefers-reduced-motion:no-preference){
  .ayah-ink-guide{animation:ayah-write var(--ayah-duration) cubic-bezier(.36,.16,.56,1) var(--ayah-start) both}
  .ayah-ink-finish{animation:ayah-ink-complete var(--ayah-duration) linear var(--ayah-start) both}
  @keyframes ayah-write{
    from{stroke-dasharray:1 1;stroke-dashoffset:1}
    to{stroke-dasharray:1 1;stroke-dashoffset:0}
  }
  @keyframes ayah-ink-complete{0%,68%{opacity:0}100%{opacity:1}}
}
@media(prefers-reduced-motion:reduce){.ayah-type-line{clip-path:none}}`;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const greenGold = {
  light: { background: '#f6f0e2', text: '#153d32', muted: '#706950', gold: '#94723a', line: '#d8c9a7' },
  dark: { background: '#102e25', text: '#f4eedc', muted: '#c0bba8', gold: '#bda36b', line: '#4a5a43' }
};
const themes = {
  neutral: {
    light: { background: '#fbfaf6', text: '#24292f', muted: '#4d4533', gold: '#8b6a2d', line: '#c3a774' },
    dark: { background: '#0d1117', text: '#edf1f6', muted: '#e7d4ad', gold: '#d0b57d', line: '#887043' }
  },
  'green-gold': greenGold
};

export function parseReference(reference) {
  const match = String(reference).trim().match(/^(\d{1,3}):(\d{1,3})$/);
  if (!match) throw new Error(`Invalid verse reference: ${reference}. Use chapter:verse, for example 94:5.`);
  const chapter = Number(match[1]), verse = Number(match[2]);
  const entry = chapters[chapter - 1];
  if (!entry || verse < 1 || verse > entry[1]) throw new Error(`Verse ${reference} is outside the Quran chapter bounds.`);
  return { chapter, verse, surah: verses.find(item => item.chapter === chapter)?.surah || entry[2] };
}

export function selectVerse(date = new Date(), fixedReference = '', random = false, pool = verses) {
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid date. Use YYYY-MM-DD.');
  if (fixedReference) return parseReference(fixedReference);
  if (!pool.length) throw new Error('No curated ayahs fit max-length. Raise the limit or set it to 0.');
  if (random) return pool[randomInt(pool.length)];
  const day = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
  return pool[((day % pool.length) + pool.length) % pool.length];
}

export function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function wrapWords(text, maxLength) {
  return wrapMeasured(text, line => [...line].length, maxLength);
}

function wrapMeasured(text, measure, maxWidth) {
  const lines = [];
  let current = '';
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (current && measure(next) > maxWidth) { lines.push(current); current = word; }
    else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

function shape(text, size) {
  const run = arabicFont.layout(text, [], 'arab', 'ARA', 'rtl');
  const scale = size / arabicFont.unitsPerEm;
  let pen = 0;
  let bottom = Infinity;
  let top = -Infinity;
  let left = Infinity, right = -Infinity;
  const glyphs = run.glyphs.map((glyph, index) => {
    if (!glyph.id) throw new Error('Amiri Quran cannot display a character in this ayah.');
    const p = run.positions[index];
    const result = { path: glyph.path.toSVG(), commands: glyph.path.commands, x: pen + p.xOffset, y: p.yOffset, box: glyph.bbox };
    if (result.path) {
      bottom = Math.min(bottom, glyph.bbox.minY + p.yOffset);
      top = Math.max(top, glyph.bbox.maxY + p.yOffset);
      left = Math.min(left, result.x + glyph.bbox.minX);
      right = Math.max(right, result.x + glyph.bbox.maxX);
    }
    pen += p.xAdvance;
    return result;
  });
  return { glyphs, width: (right - left) * scale, left: left * scale, scale, bottom: bottom * scale, top: top * scale };
}

function outlines(run, x, baseline, clock) {
  return run.glyphs.filter(g => g.path).map(g => {
    // SVG paths are kept in drawing order; start times follow the right-to-left shaped run.
    const timing = clock?.get(g);
    const mask = timing ? ` mask="url(#ayah-ink-${timing.index})"` : '';
    return `<path${mask} transform="translate(${x + g.x * run.scale} ${baseline - g.y * run.scale}) scale(${run.scale} ${-run.scale})" d="${g.path}"/>`;
  }).join('');
}

function inkGuide(g) {
  const { minX, minY, maxX, maxY } = g.box;
  const tall = maxY - minY > 1.35 * (maxX - minX);
  const axes = tall ? ([x, y]) => [y, x] : point => point;
  const segments = [];
  let point = [0, 0];
  let first = point;
  const add = next => { segments.push([axes(point), axes(next)]); point = next; };
  for (const { command, args } of g.commands) {
    if (command === 'moveTo') { point = args.slice(0, 2); first = point; }
    else if (command === 'lineTo') add(args.slice(0, 2));
    else if (command === 'closePath') add(first);
    else if (command === 'quadraticCurveTo' || command === 'bezierCurveTo') {
      const origin = point;
      const cubic = args.length === 6;
      for (let i = 1; i <= 8; i++) {
        const t = i / 8, u = 1 - t;
        add([0, 1].map(axis => cubic
          ? u ** 3 * origin[axis] + 3 * u * u * t * args[axis] + 3 * u * t * t * args[axis + 2] + t ** 3 * args[axis + 4]
          : u * u * origin[axis] + 2 * u * t * args[axis] + t * t * args[axis + 2]));
      }
    }
  }
  const high = tall ? maxY : maxX;
  const low = tall ? minY : minX;
  const span = high - low;
  let cross = tall ? (minX + maxX) / 2 : (minY + maxY) / 2;
  let nib = 75;
  const points = [];
  for (let i = 0; i < 11; i++) {
    const along = high - span * (.035 + .93 * i / 10);
    const edges = segments.flatMap(([[a, b], [c, d]]) =>
      (a <= along && along < c) || (c <= along && along < a)
        ? [b + (d - b) * (along - a) / (c - a)] : []).sort((a, b) => a - b);
    const bands = [];
    for (let j = 0; j + 1 < edges.length; j += 2) {
      const width = edges[j + 1] - edges[j];
      const middle = (edges[j + 1] + edges[j]) / 2;
      bands.push({ middle, width, score: width - Math.abs(middle - cross) * .75 });
    }
    bands.sort((a, b) => b.score - a.score);
    if (bands.length) {
      cross = bands[0].middle;
      nib = Math.max(nib, bands[0].width + 36);
    }
    points.push(tall ? [cross, along] : [along, cross]);
  }
  const pair = p => p.map(v => v.toFixed(1)).join(' ');
  // A continuous interior guide follows the ink instead of tracing the font outline.
  const path = 'M' + pair(points[0]) + points.slice(1, -1).map((p, i) =>
    'Q' + pair(p) + ' ' + pair(p.map((v, axis) => (v + points[i + 2][axis]) / 2))).join('') + 'L' + pair(points.at(-1));
  return { path, nib };
}

function inkMasks(clock) {
  if (!clock) return '';
  return [...clock].map(([g, timing]) => {
    const { minX, minY, maxX, maxY } = g.box;
    // The animated guide exists only in the mask: it cannot draw a visible outline.
    const { path, nib } = inkGuide(g);
    const bounds = `x="${minX - 24}" y="${minY - 24}" width="${maxX - minX + 48}" height="${maxY - minY + 48}"`;
    return `<mask id="ayah-ink-${timing.index}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" ${bounds}><path class="ayah-ink-guide" pathLength="1" fill="none" stroke="#fff" stroke-width="${nib}" stroke-linecap="butt" stroke-linejoin="round" style="--ayah-start:${timing.start}ms;--ayah-duration:${timing.duration}ms" d="${path}"/><rect class="ayah-ink-finish" ${bounds} fill="#fff" style="--ayah-start:${timing.start}ms;--ayah-duration:${timing.duration}ms"/></mask>`;
  }).join('');
}

function penTimings(runs, duration) {
  const glyphs = runs.flatMap(run => run.glyphs.filter(g => g.path).slice().reverse());
  const weights = glyphs.map(g => Math.max(2, Math.sqrt(g.path.length)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let elapsed = 0;
  return new Map(glyphs.map((glyph, i) => {
    const start = Math.round(elapsed * duration / total);
    const end = Math.round(Math.min(total, elapsed + weights[i] * 1.75) * duration / total);
    elapsed += weights[i];
    return [glyph, { index: i, start, duration: Math.max(1, end - start) }];
  }));
}

const glyphCount = text => [...graphemes.segment(text)].length;
const SERIF_SIZE = 15;
const ARABIC_TOP = 23;
const TRANSLATION_GAP = 8;
const TRANSLATION_LINE_HEIGHT = 19;
const BOTTOM_PADDING = 16;

function serifRun(text, size) {
  const run = serifFont.layout(text, { liga: false, clig: false });
  if (run.glyphs.some(glyph => !glyph.id)) throw new Error('The bundled serif font cannot display this translation. Use an edition in a supported Latin-script language.');
  return { run, scale: size / serifFont.unitsPerEm, width: run.advanceWidth * size / serifFont.unitsPerEm };
}

function serifInkBounds({ run, scale }) {
  return run.glyphs.reduce(({ ascent, descent }, glyph, i) => {
    const { yOffset } = run.positions[i];
    return {
      ascent: Math.max(ascent, (glyph.bbox.maxY + yOffset) * scale),
      descent: Math.max(descent, (-glyph.bbox.minY - yOffset) * scale)
    };
  }, { ascent: 0, descent: 0 });
}

function serifGeometry(shaped, x, baseline, anchor, available) {
  const { run, width, scale } = shaped;
  const fit = Math.min(1, available / width);
  const offset = anchor === 'middle' ? x - width * fit / 2 : anchor === 'end' ? x - width * fit : x;
  let pen = 0;
  return run.glyphs.map((glyph, i) => {
    const position = run.positions[i];
    const path = glyph.path.toSVG();
    const left = offset + (pen + position.xOffset) * scale * fit;
    const result = {
      advance: position.xAdvance,
      right: path ? left + glyph.bbox.maxX * scale * fit : null,
      outline: path ? `<path transform="translate(${left} ${baseline - position.yOffset * scale}) scale(${scale * fit} ${-scale})" d="${path}"/>` : ''
    };
    pen += position.xAdvance;
    return result;
  });
}

function serifPaths(text, x, baseline, size, anchor = 'start', available = Infinity) {
  return serifGeometry(serifRun(text, size), x, baseline, anchor, available).map(g => g.outline).join('');
}

function typingClip(id, glyphs, consumed, total, cardWidth, baseline, duration) {
  // Animate one clip edge, never the visibility of individual glyphs. Every
  // intermediate frame is a prefix and the unanimated rect shows every word.
  const times = [0], widths = [0];
  let index = consumed, right = 0;
  for (const glyph of glyphs) {
    if (glyph.advance) index++;
    if (glyph.right === null) continue;
    const time = Math.max(1, index) / total;
    right = Math.max(right, Math.min(cardWidth, glyph.right + 0.05));
    if (times.at(-1) === time) widths[widths.length - 1] = right;
    else { times.push(time); widths.push(right); }
  }
  if (times.at(-1) < 1) { times.push(1); widths.push(cardWidth); }
  else widths[widths.length - 1] = cardWidth;
  return `<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><rect x="0" y="0" width="${cardWidth}" height="${baseline + 20}"><animate attributeName="width" calcMode="discrete" dur="${duration}ms" keyTimes="${times.map(t => t.toFixed(9)).join(';')}" values="${widths.map(w => w.toFixed(4)).join(';')}" fill="remove"/></rect></clipPath>`;
}

function translationLines(lines, shaped, width, available, firstBaseline, animate, duration, lang) {
  const counts = shaped.map(({ run }) => run.positions.filter(p => p.xAdvance !== 0).length);
  const total = counts.reduce((sum, count) => sum + count, 0);
  let consumed = 0;
  const clips = [];
  const markup = lines.map((line, index) => {
    const y = firstBaseline + index * TRANSLATION_LINE_HEIGHT;
    const glyphs = serifGeometry(shaped[index], width / 2, y, 'middle', available);
    const id = `ayah-type-line-${index}`;
    if (animate && total) clips.push(typingClip(id, glyphs, consumed, total, width, y, duration));
    consumed += counts[index];
    const clipping = animate && total ? `<g class="ayah-type-line" clip-path="url(#${id})">` : '';
    return `<g class="ink ayah-translation" xml:lang="${escapeXml(lang)}" aria-label="${escapeXml(line)}">${clipping}${glyphs.map(g => g.outline).join('')}${clipping ? '</g>' : ''}</g>`;
  }).join('');
  return { clips: clips.join(''), markup };
}

export function renderCard({
  arabic, english = '', surah, chapter, verse, title = 'Ayah of the Day',
  translationName = DEFAULT_ENGLISH_EDITION.credit, theme = 'auto', bg = 'solid',
  palette = 'neutral', width = DEFAULT_WIDTH, showTranslation = true, lang = 'en', animate = true,
  arabicNotice = TANZIL_NOTICE
}) {
  if (theme === 'transparent') { theme = 'light'; bg = 'transparent'; }
  if (palette === 'transparent') { palette = 'neutral'; bg = 'transparent'; }
  if (theme === 'forest' || theme === 'midnight') palette = 'green-gold';
  theme = ({ forest: 'dark', midnight: 'dark' })[theme] || theme;
  if (!['light', 'dark', 'auto'].includes(theme)) throw new Error('Choose light, dark or auto for theme.');
  if (!['solid', 'transparent'].includes(bg)) throw new Error('Choose solid or transparent for bg.');
  if (bg === 'transparent' && theme === 'auto') throw new Error('Transparent cards require an explicit light or dark theme. Generate both and use a picture pair in your README.');
  if (!Object.hasOwn(themes, palette)) throw new Error('Choose neutral, green-gold or transparent for palette.');
  width = Number(width);
  if (!Number.isInteger(width) || width < 320 || width > 1600) throw new Error('Width must be an integer between 320 and 1600.');
  if (typeof showTranslation !== 'boolean') throw new Error('showTranslation must be true or false.');
  if (typeof animate !== 'boolean') throw new Error('animate must be true or false.');
  if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(lang)) throw new Error('Use a language tag such as en, de or id.');
  const color = themes[palette][theme === 'dark' ? 'dark' : 'light'];
  const css = p => `.paper{fill:${p.background}}.ink{fill:${p.text};color:${p.text}}.muted{fill:${p.muted}}.gold{fill:${p.gold}}.rule{stroke:${p.line}}`;
  const narrow = width < 500;
  const padding = narrow ? 16 : 24;
  const available = width - padding * 2;
  const size = narrow ? 35 : 37;
  const lines = wrapMeasured(arabic, line => shape(`﴿ ${line} ﴾`, size).width, available);
  const runs = lines.map((line, index) => {
    const text = `${index === 0 ? '﴿ ' : ''}${line}${index === lines.length - 1 ? ' ﴾' : ''}`;
    const run = shape(text, size);
    return run.width > available ? shape(text, size * available / run.width) : run;
  });
  let y = ARABIC_TOP;
  let arabicBottom = y;
  let paths = '';
  const animationDuration = Math.min(7000, 5000 + Math.max(0, runs.length - 1) * 650);
  const clock = animate ? penTimings(runs, animationDuration) : null;
  for (const run of runs) {
    const baseline = y + run.top;
    const left = (width - run.width) / 2 - run.left;
    paths += outlines(run, left, baseline, clock);
    arabicBottom = baseline - run.bottom;
    y = arabicBottom + 8;
  }
  const englishLines = showTranslation && english.trim() ? wrapMeasured(english, line => serifRun(line, SERIF_SIZE).width, available) : [];
  const englishRuns = englishLines.map(line => serifRun(line, SERIF_SIZE));
  const englishStart = englishRuns.length ? arabicBottom + TRANSLATION_GAP + serifInkBounds(englishRuns[0]).ascent : 0;
  const translation = translationLines(englishLines, englishRuns, width, available, englishStart, animate, animationDuration, lang);
  const contentBottom = englishRuns.length
    ? englishStart + (englishRuns.length - 1) * TRANSLATION_LINE_HEIGHT + serifInkBounds(englishRuns.at(-1)).descent
    : arabicBottom;
  const height = Math.ceil(Math.max(englishRuns.length ? width / 5.9 : 82, contentBottom + BOTTOM_PADDING));
  const reference = `${surah} · ${chapter}:${verse}`;
  const defs = inkMasks(clock) + translation.clips;
  const font = `@font-face{font-family:AyahArabicSubset;src:url(data:font/woff;base64,${arabicSubset}) format('woff')}`;
  const label = serifPaths(title, padding + 13, 17, 13, 'start', available * .52);
  const ref = serifPaths(reference, width - padding, 17, 13, 'end', available * .43);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="card-title card-desc">
  <title id="card-title">${escapeXml(title)} — ${escapeXml(reference)}</title>
  <desc id="card-desc">${escapeXml(arabic)}${showTranslation ? ` — ${escapeXml(english)} — ${escapeXml(translationName)}` : ''} — ${escapeXml(arabicNotice)}</desc>
  <metadata>${escapeXml(fontLicense)}</metadata>
  <style>${font}${css(color)}${theme === 'auto' ? `@media(prefers-color-scheme:dark){${css(themes[palette].dark)}}` : ''}${animate ? WORD_ANIMATION : ''}</style>
  ${defs ? `<defs>${defs}</defs>` : ''}
  ${bg === 'transparent' ? '' : `<rect class="paper rule" x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="7"/>`}
  <g class="gold" transform="translate(${padding + 3} 13)" aria-hidden="true"><rect x="-2.8" y="-2.8" width="5.6" height="5.6"/><rect x="-2.8" y="-2.8" width="5.6" height="5.6" transform="rotate(45)"/></g>
  <g class="muted" aria-label="${escapeXml(title)}">${label}</g>
  <g class="muted" aria-label="${escapeXml(reference)}">${ref}</g>
  <g class="ink ayah-words" aria-hidden="true">${paths}</g>
  ${translation.markup}
</svg>`;
}

const EMBED_START = '<!-- ayah-of-the-day:start -->';
const EMBED_END = '<!-- ayah-of-the-day:end -->';

export function buildEmbed({ light, dark, verseUrl, reference, surah, edition }) {
  const src = path => escapeXml(path.split('/').map(segment => encodeURIComponent(segment)).join('/'));
  const alt = escapeXml(`Daily Quran ayah, ${surah} ${reference}${edition ? ', Arabic with ' + edition.name + ' translation' : ', in Arabic'}. Read on Quran.com.`);
  const image = `<img src="${src(light)}" alt="${alt}" width="100%">`;
  const picture = dark ? `<picture><source media="(prefers-color-scheme: dark)" srcset="${src(dark)}">${image}</picture>` : image;
  const credits = edition ? ` · <a href="${escapeXml(edition.url)}">${escapeXml(edition.name)}</a>` : '';
  return `<a href="${escapeXml(verseUrl)}">${picture}</a>\n\n<sub><a href="https://tanzil.net/">Tanzil Project</a>${credits}</sub>`;
}

export function replaceEmbed(readme, embed) {
  const block = `${EMBED_START}\n${embed}\n${EMBED_END}`;
  const starts = [], ends = [];
  let offset = 0, fence = '';
  for (const line of readme.split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line.trimEnd());
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = '';
    } else if (!fence) {
      if (line.trim() === EMBED_START) starts.push(offset + line.indexOf(EMBED_START));
      if (line.trim() === EMBED_END) ends.push(offset + line.indexOf(EMBED_END));
    }
    offset += line.length + 1;
  }
  const first = starts[0] ?? -1, last = ends[0] ?? -1;
  if (first < 0 && last < 0) return `${readme.trimEnd()}\n\n${block}\n`;
  if (starts.length !== 1 || ends.length !== 1 || last < first) {
    throw new Error('README needs one correctly ordered pair of ayah-of-the-day markers.');
  }
  return readme.slice(0, first) + block + readme.slice(last + EMBED_END.length);
}

export async function generateCard({
  outputPath = 'assets/quran-ayah.svg', theme = 'auto', title = 'Ayah of the Day',
  translation = '', translationName = '', fixedReference = '', date = new Date(),
  bg = 'solid', palette = 'neutral', width = DEFAULT_WIDTH, showTranslation = true, lang = 'en', random = false, animate = true,
  maxLength = 0, requester, darkOutputPath = '', readmePath = ''
} = {}) {
  maxLength = Number(maxLength);
  if (!Number.isInteger(maxLength) || maxLength < 0) throw new Error('max-length must be a nonnegative integer.');
  if (fixedReference) parseReference(fixedReference);
  if (darkOutputPath && resolve(outputPath) === resolve(darkOutputPath)) throw new Error('Use different light and dark output paths.');
  if (readmePath && [outputPath, darkOutputPath].filter(Boolean).some(path => resolve(path) === resolve(readmePath))) {
    throw new Error('The README path must differ from the SVG output paths.');
  }
  const edition = showTranslation ? translationEdition(translation, lang, translationName) : null;
  const texts = await readEditions(edition, requester);
  const keyFor = ({ chapter, verse }) => `${chapter}:${verse}`;
  const eligible = maxLength && !fixedReference ? verses.filter(item => {
    const key = keyFor(item), arabic = texts.arabic.get(key), english = texts.translations?.get(key);
    return arabic && (!edition || english) && glyphCount(english || arabic) <= maxLength;
  }) : verses;
  const selected = selectVerse(date, fixedReference, random, eligible);
  const reference = keyFor(selected);
  const arabic = texts.arabic.get(reference);
  const english = edition ? texts.translations.get(reference) : '';
  if (!arabic || (edition && !english)) throw new Error(`Tanzil source is missing ${reference}; no cards were written.`);
  const verseUrl = `https://quran.com/${selected.chapter}/${selected.verse}`;
  const options = { ...selected, arabic, english, title, translationName: edition?.credit,
    bg, palette, width, showTranslation, lang: edition?.lang || lang, animate, arabicNotice: texts.notice };
  const svg = renderCard({ ...options, theme: darkOutputPath ? 'light' : theme });
  const dark = darkOutputPath ? renderCard({ ...options, theme: 'dark' }) : '';
  const localPath = path => relative(dirname(resolve(readmePath || 'README.md')), resolve(path)).replaceAll('\\', '/');
  const embed = buildEmbed({ light: localPath(outputPath), dark: darkOutputPath ? localPath(darkOutputPath) : '',
    verseUrl, reference, surah: selected.surah, edition });
  const updatedReadme = readmePath ? replaceEmbed(await readFile(readmePath, 'utf8'), embed) : '';
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, svg, 'utf8');
  if (darkOutputPath) {
    await mkdir(dirname(darkOutputPath), { recursive: true });
    await writeFile(darkOutputPath, dark, 'utf8');
  }
  if (readmePath) await writeFile(readmePath, updatedReadme, 'utf8');
  return { ...selected, reference, verseUrl, outputPath, darkOutputPath, embed };
}

export { verses, themes };
