"""Jinja2 templates for the narrative generator.

The system prompt is stable across runs (good for prompt caching). The user
prompt embeds run-specific data: summary + rubrics + worst-per-task cases.

Cache strategy (claude-api skill):
- System prompt + rubrics (concatenated as a single cached block) form the
  prefix and are sent with cache_control={"type": "ephemeral"}.
- The per-run user payload is the cache-miss tail.
"""

from __future__ import annotations

from jinja2 import Template

SYSTEM_PROMPT = """\
You are a senior ML evaluation engineer writing a per-run report for a
product PM.

Output ONE markdown document with this exact structure:

# {{model}} — Run {{run_id}}

**Verdict**: <SHIP | NEEDS_ADAPTATION | DO_NOT_SHIP — mirror summary.global.ship_verdict>

## TL;DR
<one sentence: strongest task + weakest task>

## Per-task analysis
### <task> — score X.XX, hard pass Y%, bad cases N
**Strengths**: <observable strength, cite specific {task}-{id}>
**Weaknesses**: <observable failure mode, cite specific {task}-{id} + failure_class>

(repeat the per-task section for every task in summary.tasks, in the
order they appear)

## Product improvement suggestions
1. **[P0|P1]** <specific, actionable, tied to a failure mode>
2. ...

## Cost
$<x.xx>, median tokens <y>

Rules:
- Cite at least one fixture_id per task — never invent ids.
- Write strengths/weaknesses as observations of what the model did or
  failed to do, not generic advice.
- Suggestions are about the product/agent under evaluation (tooling,
  prompts, scaffolding) — not about the model itself.
- Write in Chinese unless input is English-dominant.
- No preamble, no fences around the whole doc.
"""

# Rubrics block — assembled separately so it can live in the cached prefix.
RUBRICS_BLOCK_TEMPLATE = Template("""\
Rubrics for each task (used by the LLM-as-judge that produced the scores):

{% for task, rubric in rubrics.items() %}
=== Rubric: {{task}} ===
{{rubric}}

{% endfor %}\
""")

USER_PROMPT_TEMPLATE = Template("""\
Run summary:
```json
{{summary_json}}
```

Worst-3 bad cases per task (judge score + failure class + response excerpt):
{% for task, cases in worst_per_task.items() %}
=== {{task}} ({{cases|length}} cases) ===
{% for c in cases %}
- {{c.fixture_id}} | judge {{c.judge_score}} | class {{c.failure_class or "n/a"}}
  response: {{ (c.response_text or "")[:400] | replace("\n", " ") }}
  diagnostic excerpt: {{ c.diagnostic_excerpt[:600] | replace("\n", " ") }}
{% endfor %}
{% endfor %}

Now produce the narrative.md.
""")
