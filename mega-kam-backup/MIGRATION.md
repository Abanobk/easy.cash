# Mega → KAM migration (Easy Cash)

## Safety
- Never restore a Mega backup onto the live Mega installation.
- Only copy backup files into `mega-kam-backup/`.
- Wipe/import scripts are locked to tenant slug `kam` on first release.

## Pipeline
1. From Mega: use Backup and save the file outside Mega’s install folder.
2. Copy the file/folder into `mega-kam-backup/`.
3. Inspect (read-only):

```bash
pnpm mega:inspect
# or sample fixture
pnpm mega:inspect:sample
```

4. If the file is SQL Server `.bak` / proprietary binary: restore it on a **disposable** SQL Server only, export tables to CSV/JSON into `mega-kam-backup/`, then inspect again.

5. Optional dry-run wipe counts:

```bash
DATABASE_URL=... pnpm mega:wipe-kam:dry
```

6. Import into kam (with wipe):

```bash
DATABASE_URL=... npx tsx scripts/import-mega-to-tenant.mjs \
  --slug kam \
  --file ./mega-kam-backup/sample-fixture \
  --wipe \
  --confirm WIPE_KAM
```

7. Verify:

```bash
DATABASE_URL=... pnpm mega:verify
```

## UI (kam only)
`/{tenant}/settings/backup` — full JSON restore + wipe confirmation `WIPE_KAM`.

## Code
| File | Role |
|------|------|
| `server/mega-mapping.ts` | Table/column aliases |
| `server/mega-migrate.ts` | Files → Easy Cash payload |
| `server/full-restore.ts` | Full restore into tenant |
| `server/tenant-wipe.ts` | Safe kam wipe |
| `scripts/inspect-mega-backup.mjs` | Format inspector |
| `mega-kam-backup/sample-fixture/` | Offline test data |
