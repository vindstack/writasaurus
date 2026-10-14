export interface SynonymGroup {
  definition: string;
  partOfSpeech: string;
  words: string[];
}

export interface SynonymIndex {
  source: string;
  groups: SynonymGroup[];
  words: Record<string, number[]>;
}

const INDEX_URL = "/data/oewn-2025-synonyms.json";
let synonymIndexPromise: Promise<SynonymIndex> | undefined;

function isSynonymGroup(value: unknown): value is SynonymGroup {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SynonymGroup>;
  return typeof candidate.definition === "string" &&
    typeof candidate.partOfSpeech === "string" &&
    Array.isArray(candidate.words) &&
    candidate.words.every((word) => typeof word === "string");
}

export function parseSynonymIndex(value: unknown): SynonymIndex {
  if (!value || typeof value !== "object") {
    throw new Error("The offline thesaurus data has an invalid format.");
  }
  const candidate = value as Partial<SynonymIndex>;
  if (
    typeof candidate.source !== "string" ||
    !Array.isArray(candidate.groups) ||
    !candidate.groups.every(isSynonymGroup) ||
    !candidate.words ||
    typeof candidate.words !== "object"
  ) throw new Error("The offline thesaurus data has an invalid format.");

  const groups = candidate.groups as SynonymGroup[];
  const words = candidate.words as Record<string, unknown>;
  for (const indexes of Object.values(words)) {
    if (
      !Array.isArray(indexes) ||
      !indexes.every((index) => Number.isInteger(index) && index >= 0 && index < groups.length)
    ) throw new Error("The offline thesaurus index has invalid word entries.");
  }
  return { source: candidate.source, groups, words: words as Record<string, number[]> };
}

function loadIndex(): Promise<SynonymIndex> {
  if (!synonymIndexPromise) {
    synonymIndexPromise = fetch(INDEX_URL)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`The offline thesaurus data could not be loaded (${response.status}).`);
        }
        const data: unknown = await response.json();
        return parseSynonymIndex(data);
      })
      .catch((error: unknown) => {
        synonymIndexPromise = undefined;
        throw error;
      });
  }
  return synonymIndexPromise;
}

function normalizeWord(word: string): string {
  return word.replaceAll("_", " ").trim().toLocaleLowerCase("en-US");
}

export function findSynonymGroups(word: string, index: SynonymIndex): SynonymGroup[] {
  const groupIndexes = index.words[normalizeWord(word)] ?? [];
  return groupIndexes.map((groupIndex) => index.groups[groupIndex]).filter((group) =>
    group !== undefined &&
    group.words.some((candidate) => normalizeWord(candidate) !== normalizeWord(word))
  );
}

export async function lookupSynonymGroups(word: string): Promise<SynonymGroup[]> {
  if (!word.trim()) return [];
  return findSynonymGroups(word, await loadIndex());
}
