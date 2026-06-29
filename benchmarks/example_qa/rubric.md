# example_qa — scoring rubric (0–5)

Score how well the agent's answer satisfies the user's prompt, judged
against the fixture's `expected_answer_intent`. Integer scale.

| Score | Meaning |
|------:|---------|
| 5 | Fully correct and complete; directly answers the ask, no errors. |
| 4 | Correct with a minor omission or imprecision. |
| 3 | Substantially right but with a real gap (a missing part or a small factual slip). |
| 1 | Attempts the task but is largely wrong, vague, or off-topic. |
| 0 | No usable answer, or confidently incorrect. |

Notes:
- Judge correctness against the stated intent, not writing style.
- For the math item, the final number must be correct to score ≥ 3.
- Reward concrete, distinct points; penalize padding and repetition.
