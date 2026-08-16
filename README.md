<img src="docs/hero.webp" alt="Arak, the guardian who stands watch over personal data in your code" width="100%">

<p align="right"><strong>English</strong> · <a href="README.th.md">ภาษาไทย</a></p>

## The name

**อารักษ์** (*arak*) is the guardian spirit that watches over a place. A house, a field, a bend in
the river. Thai households build it a small shrine at the edge of the property and leave something
there each morning, on the understanding that what most needs protecting is rarely what anyone
remembers to guard.

Your database is such a place. Somewhere inside it sits a citizen ID, a phone number, a diagnosis.
Details belonging to real people who handed them over and assumed someone would look after them.

Nobody remembers to guard that. Everybody remembers the deadline.

## What it does

Arak watches for the moment a field is written into your schema, and asks right then whether it
holds a person's data and what you are keeping it for.

Your answers go into a catalog that lives in the repository, next to the code it describes. From
that catalog comes the document the law asks for: a Record of Processing Activities under section
39 of Thailand's Personal Data Protection Act.

It comes as a Claude Code plugin, a command line tool, and a Thai personal-data detection library
you can lift out and use on its own.

---

## Why at write time

Every privacy tool on the market scans after the fact. The report lands on a dashboard weeks after
the code shipped, by which point the field has been read by nine services, copied into two caches,
and logged somewhere nobody remembers. The report is accurate. It is also ignored, because acting
on it now costs a sprint, and there is always something more urgent than a sprint spent on a field
that already works.

One moment exists when getting it right is nearly free: when the field is first written, while
whoever wrote it still holds in their head the reason it exists.

That moment lasts about thirty seconds. Arak lives inside it.

<img src="docs/loop.svg" alt="A field is written, the guardian asks, a human decides, the record follows" width="100%">

---

<img src="docs/guardian.webp" alt="A Thai guardian deity holding a tablet of records, several lines covered by redaction bars" align="right" width="290">

## Three lines it will not cross

A guardian that decides everything on your behalf stops being a guardian and becomes a liability.
Arak holds three lines.

**It will not invent your purposes.** Arak can read a category off your code. This is a phone
number, that is a national ID. What it cannot read is *why you keep it*, because that reason is
written nowhere in the code and never will be. An `email` kept to send receipts stands on
contract. The same column kept to send promotions stands on consent. Identical in the schema,
different in law. When nothing in your catalog fits, Arak stops and asks you. A record that looks
tidy and is wrong does more damage than no record at all.

**It will not delete.** Fields vanish from schemas all the time. The data behind them does not
vanish with them. When a column disappears, Arak marks the entry `orphaned` and leaves it standing
there until a human says what became of the rows.

**It will not repeat what it sees.** When Arak sweeps your files for real personal data it prints
`08••••••••78`, never the number. CI logs outlive the files they were scanning, and a scanner that
shouts its findings into a log has become the leak it was hired to find.

<br clear="right">

---

## Install

Open Claude Code in the project you want watched:

```
/plugin marketplace add ksmaster03/arak
/plugin install arak@arak
```

Restart, then run `/arak:setup`.

It also works from [claude.ai → Settings → Plugins → Add marketplace](https://claude.ai/settings/customize-plugins)
using `https://github.com/ksmaster03/arak`.

That is the whole installation. The plugin carries its hooks and the entire `arak` command inside
dependency-free bundles, so there is no `npm install`, no `settings.json` to hand-edit, and nothing
to add to your `PATH`.

| Command | What it does |
|---|---|
| `/arak:setup` | Sets the project up, then walks you through the section 39 details no tool can guess |
| `/arak:mark` | Takes the undecided fields one at a time, showing its reasoning |
| `/arak:check` | Status, plus a sweep for real personal data sitting in your files |

<details>
<summary>Command line only</summary>

```bash
git clone https://github.com/ksmaster03/arak.git && cd arak
pnpm install && pnpm run build

node packages/cli/dist/index.js init      # create arak.config.yaml + pii-catalog.yaml
node packages/cli/dist/index.js sync      # read the schema, reconcile the catalog
node packages/cli/dist/index.js baseline  # park what already exists as acknowledged debt
node packages/cli/dist/index.js status    # the CI gate
node packages/cli/dist/index.js scan      # find real personal data in files
node packages/cli/dist/index.js ropa      # the section 39 record, as .xlsx
node packages/cli/dist/index.js semgrep   # Semgrep rules grown from the catalog
node packages/cli/dist/index.js export --format fideslang
```

`packages/plugin/bin/arak.mjs` is the same program bundled with zero dependencies. It runs from a
bare checkout with no `node_modules` at all.

On a machine with no SSH key the `owner/repo` shorthand may try SSH first. Use the full
`https://github.com/ksmaster03/arak.git`, or set `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1`.
</details>

---

## Pointing it at an old codebase

<img src="docs/terminal.svg" alt="arak sync reporting 28 undecided fields, five of them sensitive under section 26" width="100%">

Run Arak against two years of accumulated schema and it will surface dozens of pending fields at
once. This is where most privacy tools lose their user permanently.

So `arak baseline` takes everything that already exists and files it as **acknowledged debt**.
Still counted, still printed on every run, no longer failing your build and no longer interrupting
your work. From then on you are asked about one thing only: what you write next.

A guard that shouts at everything is a guard nobody listens to.

---

## Marking

It goes in the Prisma doc comment above the field, alongside whatever prose is already sitting
there.

```prisma
model Customer {
  /// Tax ID, used to issue invoices
  /// @pii(category=government_id, purposes=tax_invoice)
  taxId String?

  /// @pii(category=contact, purposes=delivery;tax_invoice)
  email String?

  /// @pii(contact)
  phone String?

  /// @not-pii(reason="Internal reference, randomly generated, not tied to a person")
  refCode String
}
```

| Key | Meaning |
|---|---|
| `category` | Data category. A bare value is shorthand: `@pii(contact)` |
| `purposes` | Keys declared in the catalog. Separate several with `;` `\|` or `+` |
| `retention` | ISO-8601 duration such as `P5Y`, for a field that outlives its purpose |
| `reason` | Required on `@not-pii`, because "not personal data" is a claim somebody will audit |

General categories: `identity` `government_id` `contact` `financial` `employment` `education`
`location` `device` `behavioral` `media` `family` `vehicle` `credential`.

Sensitive categories under section 26, counted separately because they demand explicit consent:
`health` `disability` `belief_religion` `race_ethnicity` `political_opinion` `sexual_behavior`
`criminal_record` `union` `genetic` `biometric`.

---

## The catalog

`pii-catalog.yaml` is the single source of truth, and it belongs in git where the team can argue
with it in a pull request.

```yaml
purposes:
  - key: tax_invoice
    label: Issue tax invoices and retain accounting records
    legalBasis: legal_obligation   # s.24(6)
    retention: P5Y                 # s.39(4)

fields:
  - id: prisma:Customer.taxId
    status: marked
    category: government_id
    purposes:
      - tax_invoice
    source:
      kind: prisma
      file: prisma/schema.prisma
      line: 29
      container: Customer
      field: taxId
```

The file has two halves with two different owners, and Arak respects the border absolutely.

The top half (`controller`, `purposes`, `access`, `securityMeasures`) is yours. Arak never edits
it. Comments you write there survive every sync, because the sentence your data protection officer
wrote at 11pm explaining a retention period is worth more than anything the tool generated.

The bottom half (`fields`) Arak keeps honest against your schema, adding and updating, never
removing.

## How it decides

Three rules. There have never been more than three.

1. A field annotated in the code. **The code wins**, because it travels with the code.
2. No annotation, but already in the catalog. **The catalog wins**, because a human put it there.
3. Neither. The guesser proposes it as `unmarked`, and a human settles it.

Four states: `unmarked` (new and undecided, you get asked, CI fails), `deferred` (acknowledged
debt, quiet, CI passes, still counted), `marked`, and `not-pii`. The moment a human decides, the
guesser's `confidence` and `detectedBy` are stripped out, so that nobody reading the file next year
mistakes a machine's hunch for a person's judgment.

---

## Finding what is already loose

`sync` covers what the schema *declares*. `scan` asks a different question: is real personal data
sitting in your files right now, in a seed script, a fixture, a sample SQL dump, a log somebody
committed at 2am and forgot about.

```
$ arak scan

ที่พบ
  thai_national_id     11••••••••66     prisma/seed.ts:3:40
  thai_phone           08••••••••78     prisma/seed.ts:3:64
  email                so••••••••th     prisma/seed.ts:3:87
```

The detectors live in `@arak/detect-th` and work perfectly well without the rest of Arak.

| Type | How it is caught |
|---|---|
| Thai national ID, tax ID | 13 digits **with the check digit verified**, discarding about 91% of random reference codes |
| Phone | Real structure. Mobile 06/08/09 plus eight digits, `+66` understood |
| Email, IPv4 | Standard forms |
| Thai personal name | Anchored on the honorifics นาย นาง นางสาว น.ส. ด.ช. ด.ญ. |
| Thai address | ต. อ. จ. แขวง เขต ซอย หมู่ ถนน, with adjacent fragments merged into one address |
| Licence plate | Two Thai consonants, with or without a leading digit |
| Credit card | 14 to 19 digits with Luhn |
| Passport, bank account, postal code | **A context word must sit nearby**, or false positives drown everything |

> One point of honesty about that check digit. It has a blind spot and we measured it. The third
> digit carries weight 11, which divides cleanly by 11 and so contributes nothing to the remainder.
> **Alter the third digit to anything at all and the formula cannot tell.** Other positions slip
> past about 1.7% of the time. Good enough to screen with. Not good enough to verify a human being
> with, and we will not pretend otherwise.

Files that are supposed to hold realistic-looking data can be excused:

```yaml
scan:
  ignore:
    - "**/test/**"
```

or `--ignore "<glob>"`, repeatable.

---

## The gate

```yaml
- run: node packages/cli/dist/index.js status
```

`0` means every new field has been decided.
`1` means undecided fields remain, or the catalog contradicts itself: a field marked as personal
data with no purpose attached, which section 39(2) does not allow.
`2` means it was called wrongly, or a file would not open.

`--strict` makes acknowledged debt fail too, for the day the team is ready to clear it.
`sync --check` demands that the committed catalog always match the schema.

An exit code is only visible to whoever has a terminal open. `--format sarif` puts the same
finding on the line that caused it, inside the pull request, where the decision to merge is
actually being made.

```yaml
- id: arak
  uses: ksmaster03/arak@v0.1.0
  with: { command: status }

- if: always()          # without this, a failing gate uploads nothing
  uses: github/codeql-action/upload-sarif@v3
  with: { sarif_file: '${{ steps.arak.outputs.sarif-file }}' }
```

There are also three `pre-commit` hooks, so the question gets asked before the code leaves the
machine. Both are set out in [docs/ci.md](docs/ci.md). The action runs the dependency-free bundle
committed in this repository, so nothing is installed or built while your pipeline is running.

---

## What the catalog turns into

The catalog is worth more than a passing build. Three things grow out of it, none of which invent
anything the catalog does not already hold.

| Command | What comes out |
|---|---|
| `arak ropa` | The section 39 record as `.xlsx` — one sheet for the controller, one row per processing activity, one row per field |
| `arak semgrep` | Taint rules whose sources are your marked fields and whose sinks are logs, responses and third parties |
| `arak export --format fideslang` | The catalog in [Fideslang](https://github.com/ethyca/fideslang), so it can be read by Fides, DataHub and OpenMetadata |

`arak ropa` still writes the file when fields remain undecided, and files them under a heading
that says so, but it exits `1`. A draft that admits where it is unfinished is more useful than
nothing and far safer than a record that looks complete and is not.

The Fideslang mapping is honest about the joins that do not line up. Fideslang was written around
GDPR and Arak's categories around section 26, so trade union membership has nowhere to go and
sexual orientation is not sexual behaviour. Every inexact mapping carries its reason and is
reported on export rather than quietly rounded off.

---

## Where it stands

TypeScript and Prisma are the first supported stack.

| Standing | Not yet built |
|---|---|
| Catalog covering all of section 39 | Readers beyond Prisma — SQL DDL, Drizzle, TypeORM |
| Prisma reader with `@pii` annotations | Introspecting a live database, where columns outlive the schema |
| Catalog writes that preserve your comments | Real data-flow analysis rather than name matching |
| 39 field-name heuristics | MCP server for redacted file reads |
| 12 Thai value detectors | Thai names without an honorific |
| Deterministic, reversible redactor | npm and a public marketplace listing |
| Three Claude Code hooks, plus baselining | |
| `init` · `sync` · `baseline` · `status` · `scan` | |
| `ropa` · `semgrep` · `export` | |
| SARIF output, a GitHub Action and `pre-commit` hooks | |

[docs/landscape.md](docs/landscape.md) sets Arak against the tools that solve neighbouring
problems — Fides, Bearer, Privado, Presidio, gitleaks — and records which of their ideas were
taken, which were left, and why.

The field-name guesser reads names and types, nothing more. It exists so there is something to
decide on day one. Every rule in it was cut against four production schemas, a warehouse system, a
maintenance system, an HR system and the clinic schema in `arak-sandbox`, and several of those
rules exist because the tool got it embarrassingly wrong first.

## Working on Arak

```bash
pnpm test        # 155 tests
pnpm run build
pnpm run typecheck
```

```
packages/core       Catalog model · decision rules · YAML I/O · field-name heuristics
packages/prisma     Prisma schema reader and the @pii annotations
packages/detect-th  Thai value detectors and the reversible redactor (no dependencies)
packages/cli        The arak command
packages/plugin     Claude Code plugin: hooks, commands, and a bundled arak
examples/demo-app   A worked schema used as a test bed
docs/               Artwork and diagrams
.claude-plugin/     Marketplace catalog
```

The entire project has one runtime dependency, [`yaml`](https://github.com/eemeli/yaml). For
software that reads other people's schemas and other people's data, the dependency count is part
of the argument for trusting it.

The plugin is bundled into one file per entry point deliberately. Claude Code installs a plugin by
copying only the plugin directory into its cache, and link mode does not exist on Windows, so
anything reaching across the workspace would arrive broken.

Every detector rule was cut against real data rather than imagined at a desk. When you change one
because of a case you hit in the wild, **add that case to the tests with a comment saying where it
came from.** Those comments are the institutional memory.

---

<img src="docs/seal.webp" alt="Arak seal" align="left" width="86">

**[PolyForm Noncommercial License 1.0.0](LICENSE)**, source available rather than open source.

Free for personal use, hobby projects, research, teaching, charities and government. Any use by or
for a for-profit company needs a commercial licence, internal use included. See
[COMMERCIAL.md](COMMERCIAL.md).

Whatever Arak produces, your catalog and your record, is yours entirely with nothing attached.

<br clear="left">
