import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const htmlPath = path.join(dist, 'index.html');
const outputPath = path.join(root, 'frog-ascent.html');
let html = await readFile(htmlPath, 'utf8');

const scriptTag = html.match(/<script\b(?=[^>]*\btype="module")(?=[^>]*\bsrc="([^"]+)")[^>]*><\/script>/i);
const styleTag = html.match(/<link\b(?=[^>]*\brel="stylesheet")(?=[^>]*\bhref="([^"]+)")[^>]*>/i);
if (!scriptTag || !styleTag) throw new Error('Expected one built module script and stylesheet in dist/index.html.');

const scriptPath = path.resolve(dist, scriptTag[1]);
const stylePath = path.resolve(dist, styleTag[1]);
if (!scriptPath.startsWith(dist + path.sep) || !stylePath.startsWith(dist + path.sep)) {
  throw new Error('Built assets must stay inside dist.');
}

const iconTag = html.match(/<link\b[^>]*href="[^"]*favicon\.svg"[^>]*>/i);
if (iconTag) html = html.replace(iconTag[0], () => '');

const script = (await readFile(scriptPath, 'utf8')).replace(/<\/script/gi, '<\\/script');
const stylesheet = (await readFile(stylePath, 'utf8')).replace(/<\/style/gi, '<\\/style');
html = html.replace(scriptTag[0], () => `<script type="module">${script}</script>`);
html = html.replace(styleTag[0], () => `<style>${stylesheet}</style>`);

const assetRoot = path.join(dist, 'assets');
const embeddedModels = {};
async function collectModels(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectModels(filename);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) {
      const relative = path.relative(dist, filename).split(path.sep).join('/');
      embeddedModels[relative] = (await readFile(filename)).toString('base64');
    }
  }
}
await collectModels(assetRoot);
if (Object.keys(embeddedModels).length === 0) throw new Error('No GLB models were found in the production build.');
const modelTag = `<script id="game-model-assets" type="application/json">${JSON.stringify(embeddedModels)}</script>`;
html = html.replace(/<\/body>/i, `${modelTag}</body>`);
await writeFile(outputPath, html, 'utf8');
console.log(`Standalone game written to ${outputPath} with ${Object.keys(embeddedModels).length} embedded GLB models.`);
