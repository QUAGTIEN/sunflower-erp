# Sunflower ERP architecture

Sunflower uses feature-based modules for ERP capabilities. Application
composition, reusable code, infrastructure adapters, and static data are kept in
separate top-level layers.

## Source layers

- `src/app`: application composition, navigation, routing, providers, and global lifecycle.
- `src/features`: ERP capabilities grouped by business responsibility.
- `src/shared`: reusable UI, types, hooks, utilities, and design tokens with no feature ownership.
- `src/infrastructure`: Firebase, local-storage, and HTTP adapters.
- `src/data`: static, seed, or generated data.

## Dependency direction

```text
app ────────────────> features ───────────────> shared
 │                        │                       ▲
 └────────────────────────┴──> infrastructure ───┘
```

Rules:

1. `shared` must not import from `features`, `app`, or `infrastructure`.
2. Feature models and business rules must not import React components or infrastructure adapters.
3. Features expose stable entry points from their root and owned `model` or `api` modules.
4. `app` coordinates features but must not contain feature-specific business rules.
5. Frontend imports use the `@/` alias for dependencies outside the current folder.
6. Structural changes, business behavior, and UI redesign remain separate changes.

## Verification gate

TypeScript compilation, the production build, structural lint, and smoke checks
must pass after architectural changes. The full lint baseline must not regress.

## Feature module layout

Feature modules use only the folders they need:

```text
src/features/<feature>/
├── pages/       # routable ERP screens
├── components/  # feature-owned UI
├── model/       # types and business rules
├── api/         # feature workflows and data operations
└── index.ts     # small public API
```

The application shell imports every ERP screen from a feature public API. The
former compatibility facades under `src/views`, `src/components`, `src/domain`,
and `src/services` have been removed after their consumers moved to owned paths.
