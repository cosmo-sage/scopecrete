<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Read DECISIONS.md first

`/DECISIONS.md` at the repo root is ground truth for the product, data model,
costing engine, overhead/bid-floor math, cash-flow dashboard, and agent rules.
If code disagrees with it, the code is wrong or DECISIONS.md is stale —
resolve it, don't re-derive the costing model or redesign the chart from
scratch. Update DECISIONS.md in the same PR that changes behavior it
describes.
