# Wave-3 — inventory Mega parity

**Date:** 2026-09-13  
**Evidence:** live Mega PDFs under `artifacts/mega-wave3-inventory/pdf/` (see `COLUMNS.md`)  
**Script:** `scripts/capture-mega-wave3-inventory-pdfs.mjs`

## Scope
All inventory report slugs under `invreports-*` except item aging (Mega StartScreen on test account).

## What changed in Easy
- Column labels/order aligned to Mega PDF headers (no invented titles).
- `warehouse-in-out` returns **line-level** movements (Mega PDF shape), not warehouse aggregates.
- `warehouse-movements` returns Mega running qty/value balances via `toMegaWarehouseMovementRows`.
- `item-summary` includes opening qty/value from Mega openings.
- `item-in-out` breaks out purchases/sales/returns/production + available qty.
- `stocktake` shows Mega qty / reserved / net columns (+ barcode).
- `stagnant-items` adds Mega movement-count columns.
- Inventory entity filters registered from Mega filter scan.

## Honest gaps
- Reserved/ordered qty on stocktake is `0` until Easy models reservations like Mega.
- Alt category / cash+percent discounts on items list are placeholders when fields are absent.
- Item aging: no Mega PDF on test login — layout unchanged.
- Hierarchical Mega grouping (per-item / per-warehouse sections) is still flat tables in Easy.
