import { build } from 'esbuild';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/action.mjs'],
  outfile: 'dist/action.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  banner: { js: "import { createRequire as bundleCreateRequire } from 'node:module'; const require = bundleCreateRequire(import.meta.url);" },
  legalComments: 'inline'
});

const notices = ['Third-party runtime dependency licenses\n'];
const packages = (await readdir('node_modules')).filter(name => !name.startsWith('.') && name !== 'esbuild' && !name.startsWith('@'));
for (const name of packages.sort()) {
  const directory = `node_modules/${name}`;
  const metadata = JSON.parse(await readFile(`${directory}/package.json`, 'utf8'));
  notices.push(`\n--- ${name} ${metadata.version} (${metadata.license}) ---\n`);
  const licenses = (await readdir(directory)).filter(file => /^(license|copying)/i.test(file));
  if (!licenses.length) {
    const readme = (await readdir(directory)).find(file => /^readme/i.test(file));
    if (!readme) throw new Error(`Missing license information for ${name}`);
    notices.push(await readFile(`${directory}/${readme}`, 'utf8'));
  }
  for (const file of licenses) notices.push(await readFile(`${directory}/${file}`, 'utf8'));
}
await writeFile('THIRD_PARTY_NOTICES.txt', notices.join('\n'));
console.log('Built dist/action.mjs and dependency notices.');
