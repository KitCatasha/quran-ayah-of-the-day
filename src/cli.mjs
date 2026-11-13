#!/usr/bin/env node
import { DEFAULT_WIDTH, generateCard } from './index.mjs';

const args = process.argv.slice(2);
const value = (flag, fallback = '') => {
  const index = args.indexOf(flag);
  if (index >= 0 && (!args[index + 1] || args[index + 1].startsWith('--'))) throw new Error(`${flag} needs a value.`);
  return index >= 0 ? args[index + 1] : fallback;
};
const booleanValue = (flag, fallback) => {
  const result = value(flag, String(fallback));
  if (!['true', 'false'].includes(result)) throw new Error(`${flag} must be true or false.`);
  return result === 'true';
};

try {
  const dateValue = value('--date');
  const result = await generateCard({
    outputPath: value('--output', 'assets/quran-ayah.svg'),
    darkOutputPath: value('--dark-output'),
    readmePath: value('--readme'),
    theme: value('--theme', 'auto'),
    title: value('--title', 'Ayah of the Day'),
    translation: value('--translation'),
    translationName: value('--translation-name'),
    fixedReference: value('--verse'),
    bg: value('--bg', 'solid'),
    palette: value('--palette', 'neutral'),
    maxLength: value('--max-length', '0'),
    width: value('--width', String(DEFAULT_WIDTH)),
    animate: booleanValue('--animate', true),
    lang: value('--lang', 'en'),
    showTranslation: booleanValue('--show-translation', true),
    random: booleanValue('--random', false),
    date: dateValue ? new Date(`${dateValue}T00:00:00Z`) : new Date()
  });
  console.log(`Generated ${result.surah} ${result.reference} at ${result.outputPath}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
