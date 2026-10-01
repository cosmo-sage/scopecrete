# Re-copies the title-block reader into the bid-intake edge function
# (supabase/functions/bid-intake/sheets.ts). Run after changing
# src/lib/plan-sheets.ts or parsePrintedScale in src/lib/takeoff.ts.
t = open('src/lib/takeoff.ts').read()
inches = t[t.index('/** "1/8", "3/16", "1 1/2", "0.25", "1" → inches. */'):t.index('/**\n * A length as Coy would type')]
ps = t[t.index('export type PrintedScale ='):t.index('/** Feet per point from two clicks')]
p = open('src/lib/plan-sheets.ts').read().replace('import { parsePrintedScale, type PrintedScale } from "./takeoff.ts";\n', '')
head = '''// GENERATED COPY — do not edit here. The title-block reader of
// src/lib/plan-sheets.ts and the printed-scale parser of src/lib/takeoff.ts,
// copied for the bid-intake edge function (which can only ship its own
// folder). tests/bid-intake.test.mjs checks the two read every sample alike.
// Re-copy with: python3 scripts/copy-bid-sheets.py
'''
open('supabase/functions/bid-intake/sheets.ts', 'w').write(head + '\n' + inches + ps + p)
