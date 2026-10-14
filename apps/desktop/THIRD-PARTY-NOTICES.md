# Third-party notices

## Open English WordNet 2025

The editor's offline thesaurus contains a compact index derived from the 2025 release of
[Open English WordNet](https://github.com/globalwordnet/english-wordnet). The source groups words
into synonym sets; Writasaurus extracts each set's words, part of speech, and definition for local
lookup.

The bundled index is generated from the
[2025 JSON release archive](https://github.com/globalwordnet/english-wordnet/releases/download/2025-edition/english-wordnet-2025-json.zip).
To refresh it, unpack a release archive and run:

```sh
deno run --allow-read=<unpacked-wordnet> --allow-write=apps/desktop/public/data \
  apps/desktop/scripts/build-wordnet-index.ts <unpacked-wordnet> \
  apps/desktop/public/data/oewn-2025-synonyms.json
```

Open English WordNet is based on and incorporates elements of Princeton WordNet. This data is
further developed by the Open English WordNet team and is licensed under the
[Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/).
The underlying Princeton WordNet license and attribution information are available in the
[Open English WordNet license](https://github.com/globalwordnet/english-wordnet/blob/main/LICENSE.md)
and [WordNet license file](https://github.com/globalwordnet/english-wordnet/blob/main/WNDB_License.txt).
