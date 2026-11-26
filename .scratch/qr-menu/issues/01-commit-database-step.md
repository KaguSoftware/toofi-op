# 01: Commit the database step

Status: ready-for-agent

The database for calls and guest orders is built and tested but sits uncommitted in the working tree.

## Do

1. Run `git status --short`. Expect: five new migrations `2026112000014{0..4}_guest_*.sql`, `packages/db/tests/guest-*.ts`, `packages/db/fixtures/rpc-public.json`, and changes to `check-rpc-registry.mjs`, `types.gen.ts`, `rls-matrix.ts`, `rls.test.ts`, `packages/i18n/src/errors.ts`, `.scratch/qr-menu/`.
2. With the local stack up, run `pnpm --filter @rop/db test`, `check:error-codes`, `check:rpc-registry`, `pnpm typecheck`, `pnpm lint`. The last full run was 856 passed, 0 failed, 0 skipped.
3. Commit in small steps with plain messages (for example: migrations and types; tests and guardrails; error text; plan files). The owner is the only author: no trailers, no AI mention.
4. Leave `apps/operator/src/styles/base.css` out. Its change is not from this work; ask the owner what it is.

## Done when

The tree is clean except `base.css`, and the checks in step 2 pass on the committed state.
