import { appendFile } from 'node:fs/promises';
import { DEFAULT_WIDTH, generateCard } from './index.mjs';

const input = (name, fallback = '') => process.env[`INPUT_${name.toUpperCase()}`]?.trim() || fallback;
const booleanInput = (name, fallback) => {
  const value = input(name, String(fallback));
  if (!['true', 'false'].includes(value)) throw new Error(`${name} must be true or false.`);
  return value === 'true';
};

async function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, 'utf8');
}

try {
  const result = await generateCard({
    outputPath: input('output-path', 'assets/quran-ayah.svg'),
    darkOutputPath: input('dark-output-path'),
    readmePath: input('readme-path'),
    theme: input('theme', 'auto'),
    title: input('title', 'Ayah of the Day'),
    translation: input('translation'),
    translationName: input('translation-name'),
    fixedReference: input('verse'),
    bg: input('bg', 'solid'),
    palette: input('palette', 'neutral'),
    maxLength: input('max-length', '0'),
    width: input('width', String(DEFAULT_WIDTH)),
    animate: booleanInput('animate', true),
    lang: input('lang', 'en'),
    showTranslation: booleanInput('show-translation', true),
    random: booleanInput('random', false)
  });
  await setOutput('reference', result.reference);
  await setOutput('surah', result.surah);
  await setOutput('verse-url', result.verseUrl);
  await setOutput('output-path', result.outputPath);
  console.log(`Generated ${result.surah} ${result.reference} at ${result.outputPath}`);
} catch (error) {
  console.error(`Qur'an card generation failed: ${error.message}`);
  process.exitCode = 1;
}
