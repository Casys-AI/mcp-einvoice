# Changelog

## 2026-03-23 — Code review fixes (Codex audit)

### Fixed
- **TS4114**: add `override` modifier to 8 AfnorBaseAdapter methods — tests were blocked
- **BR-FR-12 silent corruption**: SuperPDP normalizer now throws when buyer has no SIRET instead of fabricating `"0000000000000"`
- **OAuth2 hang**: token fetch now has a 15s timeout via `AbortSignal.timeout()`
- **Iopole auth/API mismatch**: default auth URL changed from production (`auth.iopole.com`) to sandbox (`auth.ppd.iopole.fr`)
- **SuperPDP pagination**: removed incorrect `offset → starting_after_id` mapping (cursor-based, not offset-based)
- **Misleading count**: invoice search count now reflects post-filtered rows when client-side filtering is applied
- **HTTP exposure**: default hostname changed from `0.0.0.0` to `localhost` for local dev safety

### Removed
- `error-handler.ts` (dead code — replaced by framework-level `toolErrorMapper`)
