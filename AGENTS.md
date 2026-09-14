# Check Sunfood — Codex Instructions

## Project goal
Build the independent Sunfood Tây Đô supplier traceability system for `https://check.sunfoodtaydo.com`.

Public QR URLs must stay stable:
- `/qr/NCC-01`
- ...
- `/qr/NCC-23`

The production runtime must not depend on SmartCheck. SmartCheck URLs are legacy migration/audit sources only.

## Local stack
- Next.js 16
- React 19
- Prisma 7
- SQLite for localhost
- PostgreSQL planned for production

## First tasks
1. Make `npm install`, `npx prisma generate`, `npm run db:push`, `npm run db:seed`, `npm run dev`, and `npm run build` pass cleanly.
2. Improve the public mobile-first traceability UI.
3. Add admin authentication.
4. Implement full Supplier CRUD.
5. Implement Document CRUD and local PDF/JPG/PNG upload.
6. Add document expiry status and 30/60/90-day warnings.
7. Make the four public tabs functional: source information, legal documents, certificates/testing, update history.
8. Add QR generation/download in PNG and SVG using `NEXT_PUBLIC_SITE_URL/qr/NCC-xx` exactly.
9. Add audit logs and admin search/filter.
10. Prepare PostgreSQL/object-storage production migration and DNS deployment checklist.

## Data rules
- Never invent legal information.
- Keep `sourceUrl` and `legacyDocsUrl` only for migration/audit.
- Only publish supplier files Sunfood is authorized to store and disclose.
- Preserve the supplier codes NCC-01 through NCC-23.

## Public Sunfood information
- CÔNG TY CỔ PHẦN THỰC PHẨM SUNFOOD TÂY ĐÔ
- MST: 0110716043
- Địa chỉ cơ sở: Số 17-19 Khu TT Cầu 1, đường Phan Bá Vành, phường Đông Ngạc, TP Hà Nội
- Email: tpsunfoodtaydoo@gmail.com
- Website: www.sunfoodtaydo.com

See `CODEX_MASTER_PROMPT.md` for the full implementation brief.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
