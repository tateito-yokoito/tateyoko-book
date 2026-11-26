import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import kuromoji from 'kuromoji';

const dictionaryPath = fileURLToPath(new URL('../node_modules/kuromoji/dict/', import.meta.url));
const outputPath = fileURLToPath(new URL('../src/lib/nameReadingDictionary.json', import.meta.url));
const tokenizer = await new Promise((resolve, reject) => {
  kuromoji.builder({ dicPath:dictionaryPath }).build((error, value) =>
    error ? reject(error) : resolve(value));
});
const dictionary = tokenizer.token_info_dictionary;
let highestId = 0;
for (const ids of Object.values(dictionary.target_map)) {
  for (const id of ids) highestId = Math.max(highestId, id);
}
const names = { family_name:new Map(), given_name:new Map() };

for (let id = 0; id <= highestId; id += 10) {
  const parts = dictionary.getFeatures(id)?.split(',');
  if (parts?.[1] !== '名詞' || parts[2] !== '固有名詞' || parts[3] !== '人名') continue;
  const field = parts[4] === '姓' ? 'family_name' : parts[4] === '名' ? 'given_name' : null;
  const name = parts[0];
  const reading = parts[8];
  if (!field || !/\p{Script=Han}/u.test(name) || !/^[\u30a1-\u30f6ー]+$/u.test(reading)) continue;
  const cost = dictionary.dictionary.getShort(id + 4);
  const prior = names[field].get(name);
  if (!prior || cost < prior.cost) names[field].set(name, { reading, cost });
}

const output = Object.fromEntries(Object.entries(names).map(([field, values]) =>
  [field, Object.fromEntries([...values].sort(([a], [b]) => a.localeCompare(b, 'ja'))
    .map(([name, { reading }]) => [name, reading]))]));
await writeFile(outputPath, `${JSON.stringify(output)}\n`);
console.log(`Saved ${Object.values(output).map(value => Object.keys(value).length).join('/')} name readings`);
