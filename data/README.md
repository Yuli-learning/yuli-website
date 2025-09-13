# Specification Links

This folder contains `spec-links.json`, the authoritative mapping from Subject → Level → Exam Board to the official specification landing page.

## Editing links
- Keep links pointing to the board's canonical subject landing page (not PDFs).
- Supported boards (keys): AQA, Pearson Edexcel, OCR, WJEC/Eduqas, CCEA.
- You may keep existing object-map structure or array-of-objects. The verifier will normalize values to objects and add health metadata.

## Health metadata
After running the verifier, each link may receive optional fields:
- `status`: "ok" or "broken".
- `lastChecked`: ISO timestamp of last verification.
- `finalUrl`: if the page redirected.

The UI will disable and tooltip any link where `status` is "broken".

## Verify links
Run the verifier from the project root:

```bash
npm run verify:specs
```

The script:
- Follows redirects and checks HTTP status.
- Confirms the domain matches the expected board.
- Checks the page title contains the subject and level keywords.
- Writes back health metadata to `spec-links.json`.

If any links are broken, the command exits with a non‑zero code, which you can use in CI or a pre‑commit hook.
