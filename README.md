# Statement

Turns **any** bank statement into the picture the bank never shows you: what
actually came in, what actually went out, and the rhythm underneath it.

Everything is parsed **in the browser**. No file is uploaded anywhere, there is
no backend, and nothing is stored.

```bash
npm install
npm run dev
```

## What it accepts

| Format               | Notes                                                        |
| -------------------- | ------------------------------------------------------------ |
| `.pdf`               | Any text-layer statement (not a scan)                        |
| `.xlsx` `.xls`       | Any export; the transaction sheet is picked automatically     |
| `.csv` `.tsv`        | With or without a header row                                  |

There are **no bank-specific parsers**. Layout is worked out from the file
itself, so a bank nobody has ever tested works the same as a familiar one. Drop
in several accounts to get one combined picture.

Handled automatically:

- Debit/credit column pairs **or** a single signed amount column
- `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD`, `10 May 2023`, `05-Jan-2026`
- `1,234.56` and `1.234,56`, `(1,234.56)` and `1,234.56 DR` for negatives
- `--`, `-`, `N/A`, `nil` as empty cells
- Currency from the statement (₦, $, £, €, ISO codes), overridable

### When it isn't sure

Detection reports a confidence score. Below the floor, the app stops and shows
the table with a dropdown over each column, a date-order picker, and a live
preview of the transactions your choices produce. That review screen is what
makes "any bank" true rather than aspirational — no layout is a dead end.

## The idea

A raw statement massively overstates both income and spending, because the same
money is counted several times as it moves around:

```
Bank ──▶ wallet ──▶ savings vault ──▶ back out ──▶ purchase
   five statement entries, one actual purchase
```

So every transaction is tagged before anything is charted:

| Kind       | Meaning                                             | Counted? |
| ---------- | --------------------------------------------------- | -------- |
| `external` | Money crossing the boundary of all your accounts    | ✅       |
| `self`     | Moved between accounts you own                      | ❌       |
| `internal` | In-app housekeeping (auto-save, vaults, round-ups)  | ❌       |
| `fee`      | Bank charges, VAT, stamp duty, levies               | ❌       |
| `reversal` | Reversed or refunded entries                        | ❌       |

Excluded totals are shown at the bottom of the dashboard, so nothing is
silently swept away.

### Who counts as "you"

Self-transfer detection is the difference between a useful dashboard and a wrong
one, and it goes wrong in both directions. Names and account numbers are
detected from each statement and shown in an editable **This is me** panel.

- The same person is `MUSTAPHA IBRAHIM` at one bank and `MUSTAPHA ALHAJI
  IBRAHIM` at another, so the matcher uses the union of every statement's name
  plus any aliases you add.
- A name counts as you when all of its tokens belong to your name *and* it
  **starts** with one of your first names — `Mustapha Liman Mohammed` and
  `Ibrahim Mustapha` stay external.
- An account number in a description only counts when it's a *different* account
  of yours. Banks print your own number on airtime top-ups and bill payments;
  treating that as conclusive marked ₦700k of ordinary spending as transfers.
- `NIP/GTB/YAHAYA ADELEKE/NIP Transfer to MUSTAPHA IBRAHIM` contains your name —
  as the *beneficiary*. An `FRM` segment always wins, and a `to …` clause is
  only read when no earlier segment names someone else.

## Views

- **Annual inflow** — external credits per calendar year, partial years labelled
- **Spending rhythm** — calendar heatmap of daily outflow, one tab per year
- **Monthly rhythm** — every month side by side with totals
- **Where it goes** — category split plus biggest recipients and senders
- **Balance trend** — end-of-day balance from the account that reports one

Shade buckets are quantiles of your own data, not fixed thresholds, so a quiet
year and a heavy year are both readable.

## Downloads

Every chart has a **Save** control offering:

- **PNG** — the card exactly as rendered, at 2× for legibility in docs and
  slides. The button and hover tooltip are excluded from the capture, and the
  card background is baked in so the image isn't transparent when pasted.
- **CSV** — the numbers behind that chart. The spending rhythm exports the year
  currently on screen; "Where it goes" carries a `Section` column because it's
  three tables in one card.

CSV output is RFC 4180 escaped, which is not optional here: counterparty names
come straight from bank narrations and contain commas (`HAIGHA & CO, LTD`),
quotes and the occasional newline. Files are written with a UTF-8 BOM so Excel
renders `₦` correctly instead of mangling it.

## Layout

```
src/
  lib/
    types.ts          shared types
    money.ts          amount parsing, currency detection, formatting
    dates.ts          date parsing + column-wide format inference
    extractPdf.ts     PDF   -> RawTable  (geometric column recovery)
    extractTable.ts   XLSX/CSV -> RawTable
    detectColumns.ts  RawTable -> ColumnMap + confidence
    buildStatement.ts ColumnMap -> Txn[] + account metadata
    counterparty.ts   description -> the other party's name
    classify.ts       self / internal / fee / reversal tagging
    aggregate.ts      derives every series the views render
    ingest.ts         one file in, one outcome out
    format.tsx        currency formatting context
    export.ts         PNG capture + RFC 4180 CSV
  components/
    Upload.tsx  MappingReview.tsx  IdentityPanel.tsx
    AnnualInflow.tsx  DailyRhythm.tsx  MonthlyRhythm.tsx
    Breakdown.tsx  BalanceTrend.tsx  ui.tsx
```

### Extraction gotchas worth knowing

These were all found by running real statements through the pipeline, and each
one silently corrupted the output before it was fixed:

- **PDFs have no table structure**, only glyphs at coordinates. Columns are
  recovered by clustering the x-positions of amounts, which is what lets a blank
  debit cell stay blank instead of being mistaken for a credit.
- **pdf.js merges adjacent cells** into one text item — `"0.00 29/09/2024"` is
  the credit *and* the value date. Items are split into tokens with interpolated
  positions, or every credit on those rows is lost.
- **Descriptions contain stray digits** (`MNFY 26`). Treated as amounts they
  invent phantom columns to the left of the real ones and swallow the
  description, so a money token must carry two decimal places.
- **`"10 May 2023"` survives a naive digit-strip as `102023`.** A value-date
  column read as an amount produced a total in the quadrillions.
- **Spreadsheet `!ref` ranges lie.** Real exports declare a range starting below
  the header, hiding it along with the account metadata; the range is forced
  back to the origin.
- **`--` is not text.** Counting placeholders as content makes a perfectly good
  debit column look like prose and get ignored.
- **Plurals matter.** `Lodgements` not matching a `lodgement` synonym made every
  credit in a GTBank-style file disappear.
# TrueSpend
