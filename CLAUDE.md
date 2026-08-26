# CLAUDE.md

Astro integration that renders Amazon / Rakuten / Yahoo! affiliate product cards.

## Commands

```sh
bun test              # unit tests
bun run test:coverage # tests with coverage gate
bun run typecheck     # tsc --noEmit
bun run build         # clean + tsc + copy card.css into dist/
```

## Releasing

**Invariant: the npm version, the git tag, and the GitHub release must always match.**
Every version published to npm has exactly one `vX.Y.Z` git tag and one GitHub release
pointing at the same commit. Never publish to npm without cutting the matching release,
and never cut a release for a version that was not published.

Checklist for a release:

1. Bump `version` in `package.json` (semver: `fix:` → patch, `feat:` → minor).
2. Commit as `chore: release X.Y.Z`.
3. Push the commit (ask the human first — pushing is never implicit).
4. `npm publish` — `prepublishOnly` runs the tests and the build. Publish first, so a
   failing build never leaves a GitHub release for a version npm does not have.
5. `gh release create vX.Y.Z --target <commit> --title vX.Y.Z --generate-notes`
   (this creates the tag server-side; no separate `git push --tags` needed).

Verify the three stay in step:

```sh
npm view astro-affiliate-card versions --json   # published versions
gh release list                                 # GitHub releases
git tag --sort=v:refname                        # tags
```

To find which commit a published version came from: `npm view astro-affiliate-card@X.Y.Z gitHead`.

## Conventions

- Docs, code comments, and commit messages in English (public repository).
- Conventional commits: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.
