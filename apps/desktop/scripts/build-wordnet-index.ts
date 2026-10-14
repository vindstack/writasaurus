interface SourceSynset {
  definition?: unknown;
  members?: unknown;
  partOfSpeech?: unknown;
}

interface SynonymGroup {
  definition: string;
  partOfSpeech: string;
  words: string[];
}

const [sourceDirectory, outputPath] = Deno.args;
if (!sourceDirectory || !outputPath) {
  throw new Error(
    "Usage: deno run --allow-read=<unpacked-wordnet> --allow-write=<output> " +
      "apps/desktop/scripts/build-wordnet-index.ts <unpacked-wordnet> <output>",
  );
}

function displayWord(word: string): string {
  return word.replaceAll("_", " ").trim();
}

function indexWord(word: string): string {
  return displayWord(word).toLocaleLowerCase("en-US");
}

const groups: SynonymGroup[] = [];
const wordGroups = new Map<string, number[]>();
const sourceFiles: string[] = [];

for await (const entry of Deno.readDir(sourceDirectory)) {
  if (entry.isFile && entry.name.endsWith(".json") && !entry.name.startsWith("entries-")) {
    sourceFiles.push(entry.name);
  }
}

sourceFiles.sort();
if (sourceFiles.length === 0) {
  throw new Error(`No WordNet synset JSON files found in ${sourceDirectory}.`);
}

for (const filename of sourceFiles) {
  const source = JSON.parse(
    await Deno.readTextFile(`${sourceDirectory}/${filename}`),
  ) as Record<string, SourceSynset>;
  for (const [id, synset] of Object.entries(source)) {
    if (!Array.isArray(synset.members)) continue;
    const wordsByKey = new Map<string, string>();
    for (const member of synset.members) {
      if (typeof member !== "string") continue;
      const word = displayWord(member);
      if (word) wordsByKey.set(indexWord(word), word);
    }
    const words = [...wordsByKey.values()];
    if (words.length < 2) continue;

    const definition = Array.isArray(synset.definition)
      ? synset.definition.filter((text): text is string => typeof text === "string").join(" ")
      : "";
    const groupIndex = groups.length;
    groups.push({
      definition: definition || id,
      partOfSpeech: typeof synset.partOfSpeech === "string" ? synset.partOfSpeech : "",
      words,
    });
    for (const word of words) {
      const key = indexWord(word);
      const indexes = wordGroups.get(key) ?? [];
      indexes.push(groupIndex);
      wordGroups.set(key, indexes);
    }
  }
}

const index = Object.fromEntries(
  [...wordGroups.entries()].sort(([left], [right]) => left.localeCompare(right, "en")),
);
const result = {
  source: "Open English WordNet 2025",
  groups,
  words: index,
};

await Deno.writeTextFile(outputPath, JSON.stringify(result));
console.log(
  `Indexed ${groups.length} synonym sets across ${wordGroups.size} terms into ${outputPath}.`,
);
