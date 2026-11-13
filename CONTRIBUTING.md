# Contributing

Contributions that improve accessibility, documentation, themes or reliability
are welcome. Please keep changes focused and explain how they were tested.

Changes to the curated verse list require an exact chapter and verse reference.
Do not edit Arabic text or translations in this repository: the generator reads
them from the credited Tanzil downloads at runtime.

Before opening a pull request, run:

```bash
npm ci
npm test
npm run build
npm run generate
```

Commit the rebuilt `dist/action.mjs` and dependency notices when source or
dependencies change, since GitHub executes the bundled Action directly.
