# LLM-as-a-Judge and Quality Gate

# what it does: Runs our golden dataset through the exact versioned prompt + output guadrail pipeline, uses our LLM judge to score Faithfulness(0.0-1.0), verifies citation integrity, and exits with a non-zero status code if average faithfulness drops below 0.85(blocking bad PRs in CI/CD)

import asyncio
import json
from pathlib import Path
from pydantic import BaseModel, Field
from app.core.llm_gateway import generate_completion
from app.core.prompt_manager import get_versioned_prompt
from app.guardrails.output_guard import GroundAnswer, parse_and_verify_output


class EvalJudgeScore(BaseModel):
    faithfulness: float = Field(
        ge=0.0, le=1.0, description="1.0 if 100% grounded in context without hallucination")
    relevance: float = Field(
        ge=0.0, le=1.0, description="1.0 if directly answers user query or properly refuses when missing")
    reasoning: str


async def evaluate_single_case(case: dict, system_prompt: str) -> dict:
    chunks = case["mock_chunks"]
    valid_ids = {c["chunk_id"] for c in chunks}
    context_block = "\n\n".join(
        f"[chunk_id: {c['chunk_id']} | file: {c['filename']} | page: {c['page']}]\n{c['content']}"
        for c in chunks
    )

    # generate candidate answer using the active versioned prompt
    gen_res = await generate_completion(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",
                "content": f"Context:\n{context_block}\n\nQuestion: {case['query']}"},
        ],
        model_group="primary-chat",
        temperature=0.0,
        response_format=GroundAnswer,
        metadata={"trace_name": "ci-eval-candidate", "eval_id": case["id"]},
    )

    verified = parse_and_verify_output(gen_res['content'], valid_chunk_ids=valid_ids)

    # score with llm-as-a-judge
    judge_prompt = (
        "Evaluate the AI response against the provided Context and Expected Criteria.\n"
        f"Question: {case['query']}\n"
        f"Context:\n{context_block}\n"
        f"Expected Criteria: {case['expected_answer_points']} (Expect Refusal: {case['expect_refusal']})\n"
        f"AI Response: {json.dumps(verified)}\n\n"
        "Score faithfulness (0.0 to 1.0, no outside facts) and relevance (0.0 to 1.0)."
    )

    judge_res = await generate_completion(
        messages=[{"role": "user", "content": judge_prompt}],
        model_group="fast-grader",
        temperature=0.0,
        response_format=EvalJudgeScore,
        metadata={"trace_name": "ci-eval-judge", "eval_id": case["id"]},
    )

    scores = json.loads(judge_res["content"])
    citation_valid = len(verified["guardrail_notes"]) == 0

    return {
        "id": case["id"],
        "faithfulness": scores["faithfulness"],
        "relevance": scores["relevance"],
        "citation_valid": citation_valid,
        "confidence": verified["confidence"],
        "reasoning": scores["reasoning"],
    }

async def run_eval_suite(min_faithfulness: float = 0.85) -> dict:
    dataset_path = Path(__file__).parent / 'golden_dataset.json'
    dataset = json.loads(dataset_path.read_text(encoding='utf-8'))

    vp = get_versioned_prompt("anchordocs-grounded-qa", label="production")
    results = []

    for case in dataset:
        res = await evaluate_single_case(case, vp.template)
        results.append(res)
    
    avg_faithfulness = round(sum(r['faithfulness'] for r in results) / len(results), 3)
    avg_relevance = round(sum(r["relevance"]
                          for r in results) / len(results), 3)
    passed = avg_faithfulness >= min_faithfulness and all(
        r["citation_valid"] for r in results)
    
    return {
        "prompt_name": vp.name,
        "prompt_version": vp.version,
        "avg_faithfulness": avg_faithfulness,
        "avg_relevance": avg_relevance,
        "threshold": min_faithfulness,
        "passed": passed,
        "cases": results,
    }

if __name__ == '__main__':
    report = asyncio.run(run_eval_suite())
    print(json.dumps(report, indent=2))
    if not report['passed']:
        raise SystemExit(1)

    

