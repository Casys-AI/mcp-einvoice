# Changelog

## 0.1.2 (2026-03-23)

### Fixed

- **TS4114**: add `override` modifier to 8 AfnorBaseAdapter methods — tests were
  blocked
- **BR-FR-12 silent corruption**: SuperPDP normalizer now throws when buyer has
  no SIRET instead of fabricating `"0000000000000"`
- **BR-FR-12 scope**: electronic_address check now only applies to French buyers
  (country=FR)
- **OAuth2 hang**: token fetch now has a 15s timeout via `AbortSignal.timeout()`
- **Iopole auth/API mismatch**: default auth URL changed from production to
  sandbox (`auth.ppd.iopole.fr`)
- **SuperPDP pagination**: removed incorrect `offset → starting_after_id`
  mapping
- **Misleading count**: invoice search count now reflects post-filtered rows
- **HTTP exposure**: default hostname changed from `0.0.0.0` to `localhost`
- **E2E tests**: all E2E tests now use `unwrapStructured` for structuredContent
  responses
- **Storecove adapter**: added missing imports, `override` modifiers, type
  coercion fix

### Added

- 164 unit tests: config tools (58), Storecove adapter (51), AFNOR client (21),
  AFNOR base-adapter (34)
- Total test count: 205 → 369

### Removed

- `error-handler.ts` (dead code — replaced by framework-level `toolErrorMapper`)

### Docs

- README updated to match current architecture (BaseAdapter hierarchy, 6
  viewers, correct tool counts)
