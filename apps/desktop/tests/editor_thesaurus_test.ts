import { readFile } from "node:fs/promises";
import { test } from "vitest";
import {
  findSynonymGroups,
  parseSynonymIndex,
  type SynonymIndex,
} from "../src/lib/editor/thesaurus.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

test("editor thesaurus filters the original word from each sense", () => {
  const index: SynonymIndex = {
    source: "fixture",
    groups: [
      {
        definition: "feeling pleasure",
        partOfSpeech: "a",
        words: ["happy", "glad", "content"],
      },
    ],
    words: { happy: [0], glad: [0], content: [0] },
  };
  const groups = findSynonymGroups("HAPPY", index);
  assert(groups.length === 1, "Expected the matching synonym group");
  assert(
    groups[0].words.join(",") === "happy,glad,content",
    "Expected the group to retain the other alternatives",
  );
});

test("bundled Open English WordNet includes offline alternatives", async () => {
  const contents = await readFile(
    new URL("../public/data/oewn-2025-synonyms.json", import.meta.url),
    "utf8",
  );
  const index = parseSynonymIndex(JSON.parse(contents) as unknown);
  const groups = findSynonymGroups("happy", index);
  assert(groups.length > 0, "Expected offline senses for happy");
  assert(
    groups.some((group) => group.words.some((word) => word.toLowerCase() === "glad")),
    "Expected glad as an offline alternative for happy",
  );
});
