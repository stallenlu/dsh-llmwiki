# LLM Wiki for DeepSeek Harness (`@sidady/dsh-llmwiki`)

Turn documents into an organized, interlinked knowledge base inside DSH. This plugin is a **clean-room native implementation** of the LLM Wiki *knowledge model* made popular by the upstream project, plus an optional bridge to a running desktop app.

## Install

```sh
dsh plugin add @sidady/dsh-llmwiki
```

Or install the GitHub source directly:

```sh
dsh plugin add stallenlu/dsh-llmwiki
```

> This is a **non-official** plugin. See the attribution and disclaimer below. It is published under the `@sidady` npm scope because the unscoped name `dsh-llmwiki` is already taken by an unrelated package.

## What it does

- **Wikis (vaults)** stored as plain UTF‑8 markdown under `%USERPROFILE%/.dsh/llm-wiki` (override with `LLM_WIKI_HOME`).
- **Ingest** any text: SHA‑256 dedupe, automatic summary + key phrases, immutable raw source, generated wiki page with source traceability. Optional AI enrichment via any OpenAI‑compatible endpoint.
- **Pages** with YAML frontmatter and `[[wikilinks]]`; read, create, edit, delete with inbound-link cleanup.
- **Graph** built from four signals (direct links ×3.0, source overlap ×4.0, Adamic–Adar ×1.5, type affinity ×1.0), with cluster detection, cohesion, surprising connections and gap detection.
- **Retrieval** with token-scored matching, two-hop graph expansion, a 60/20/5/15 token budget and `[n]` citations — a grounded context pack for your AI.
- **Review** for unsourced pages, dangling links, stubs, orphans and possible contradictions.
- **Chat packs** that persist a JSONL session history.
- **Export / import** a whole wiki as a portable, self-contained ZIP.
- **Optional desktop bridge** to a running `nashsu/llm_wiki` app (`http://127.0.0.1:19828`) — status, projects, files, search, chat, graph, write.

Everything works natively without the desktop app; the bridge is purely additive.

### Self-maintaining knowledge (fusion enhancements)

Inspired by the *self-growing, self-aging* wiki discipline of [iwtown/dsh-llm-wiki](https://github.com/iwtown/dsh-llm-wiki) (MIT; see attribution), the plugin now adds:

- **Always-on context compass** — a compact, cached system-prompt section tells the main Agent which wikis exist and how to use them; writing rules (dedupe first, ≥2 `[[links]]`, sources, aging flags) travel with it.
- **Writing discipline hints** — `writePage` returns plain-language reminders when a page lacks sources or double links (soft guidance; never blocks a write).
- **Aging & quality** — `rate` (1–5), `setAging` (archived/superseded/recall), `staleReview` (ranked, with human reasons), and reversible `hygiene` bulk actions. All state is stored as *scalar* frontmatter fields on the existing pages.
- **mnemon-assisted retrieval** — `fusedQuery` mixes lexical BM25-style hits with `mnemon_recall` evidence via Reciprocal Rank Fusion (K=5, WB=1.0, WM=0.5) then re-ranks by quality/freshness. It **degrades to lexical-only** when dsh-mnemon is absent or its embedding service is off (the default here). No vector service is required.
- **Profile digest with a human gate** — `profileDigest` surfaces candidate user-profile pages and candidate `mnemon_runtime_memory` entries, but **never writes USER.md**; a person/Agent must confirm first.
- **Maintenance plan** — `maintenancePlan` returns a human-readable plan plus a copy-pasteable, opt-in `schedule_create` suggestion; it never creates scheduled tasks silently.
- **Explicit compile hint** — `compileHint` records a session worth distilling; the `session/disposed` hook only writes a lightweight timestamp (it never reads session logs).

## Use it

In chat, call the `llm_wiki` tool, e.g.:

```
llm_wiki(action="createVault", name="Research", purpose="...")
llm_wiki(action="ingest", vault="research", title="Attention paper", text="...")
llm_wiki(action="graph", vault="research")
llm_wiki(action="query", vault="research", question="What are the main ideas?")
```

Or open the **LLM Wiki** panel from the sidebar for a no-code interface (vaults → ingest → pages → graph → ask → review → maintain). Maintenance actions and fusion retrieval are also available in the panel.

New maintenance tools at a glance:

```
llm_wiki(action="staleReview", vault="research")
llm_wiki(action="rate", vault="research", path="concepts/Transformers.md", quality=5)
llm_wiki(action="setAging", vault="research", path="concepts/Old.md", superseded=true)
llm_wiki(action="fusedQuery", vault="research", question="...")   # lexical + mnemon RRF
llm_wiki(action="profileDigest", vault="research")               # candidates only, no auto-write
llm_wiki(action="maintenancePlan", vault="research")             # human plan + opt-in schedule text
```

## Optional AI enrichment

Set these environment variables to enable `generate: true` on ingest:

- `LLM_WIKI_LLM_BASE_URL` — e.g. `http://127.0.0.1:11434/v1`
- `LLM_WIKI_LLM_MODEL` — e.g. `llama3`
- `LLM_WIKI_API_KEY` — optional bearer token

No key or secret is ever written into a page or returned by a tool.

---

## Attribution & disclaimer

This project is **inspired by** two excellent upstream projects. Both are acknowledged here; this plugin is **non-official** and neither project endorses it.

1. **[LLM Wiki](https://github.com/nashsu/llm_wiki)** by **Yong Su** (Copyright © 2024–2026 Yong Su), licensed under the **GNU General Public License v3.0**.
   - This plugin is an **independent, non-official** work. It is **not** affiliated with, endorsed by, or maintained by the upstream author or project.
   - No source code from the upstream repository was copied. The core engine is original, MIT-licensed clean-room code that reproduces the *knowledge model and concepts* (persistent wiki over sources, `[[wikilinks]]`, source traceability, graph signals, cited retrieval) using DSH-native facilities only.
   - The upstream **LLM Wiki desktop application remains GPL‑3.0**; its copyright and license are retained by their respective owner. Use of the optional desktop bridge does not change that license.
2. **[iwtown/dsh-llm-wiki](https://github.com/iwtown/dsh-llm-wiki)** by **iwtown**, licensed under the **MIT License**.
   - The self-maintaining capabilities above (writing discipline, quality/aging scoring, BM25 + mnemon RRF fusion, routing ideas, maintenance-plan and evaluation concepts) are **logic-level inspirations only** — no source code from that repository was copied. Its copyright remains with iwtown.
   - dsh-mnemon (github.com/omdsh-dev/dsh-mnemon, MIT) is used only through its public host tools; this plugin does not modify it.

- Use of this plugin is at your own risk. No warranty is provided; see [LICENSE](LICENSE).
- The full design, capability comparison, multi-path trade-offs and the pre-implementation review (with four corrected technical findings) are recorded in `../PLAN-FUSION.md`.

If you find this model useful, please consider starring and supporting the original project.

## License

MIT — see [LICENSE](LICENSE).
