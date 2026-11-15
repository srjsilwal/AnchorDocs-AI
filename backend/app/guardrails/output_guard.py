# Pydantic Schema and Hallucinated Citation

import json
import re
from typing import Literal
from pydantic import BaseModel, Field, ValidationError

class Citation(BaseModel):
    chunk_id: str = Field(description= "Exact Id of the retreived source chunk")
    quote: str = Field(description="Short verbatim snippet supporting the claim")

class GroundAnswer(BaseModel):
    answer: str = Field(description="clear, accurate response grounded strictly in the provided context")
    citations: list[Citation] = Field(default_factory=list)
    confidence: Literal['high', 'medium', 'insufficient_evidence'] = Field(description="confidence based strictly on retrieved context availablity")


def parse_and_verify_output(raw_llm_text: str, valid_chunk_ids: set[str] | None = None) -> dict:
    """
    Validates LLM JSON output against GroundAnswer schema and verifies that every cited chunk_id actually exists in the retrieved context.
    """

    # Strip markdown code fences if a fallback model wrapped the JSON
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "",
                     raw_llm_text.strip(), flags=re.I)

    try:
        parsed_json = json.loads(cleaned)
        validated = GroundAnswer.model_validate(parsed_json)
    except (json.JSONDecodeError, ValidationError):
        return {
            "answer": raw_llm_text.strip(),
            "citations": [],
            "confidence": "medium",
            "guardrails_notes": ["Fallback: response normalized from unstructured text"]
        }
    
    notes: list[str] = []

    # verify citations against acutal retreived chunks (anti-hallucination check)
    if valid_chunk_ids is not None:
        verified_citations = []
        for cit in validated.citations:
            if cit.chunk_id in valid_chunk_ids:
              verified_citations.append(cit)
            else:
                notes.append(f"Stripped hallucinated citation ID: {cit.chunk_id}")
        validated.citations = verified_citations

        # enforce refusal policy if context was provided but zero valid citations remain
        if valid_chunk_ids is not None and len(valid_chunk_ids) > 0 and len(validated.citations) == 0:
            if validated.confidence == 'high':
                validated.confidence == 'medium'
                notes.append('Downgraded confidence: no verified chunk citations attached')
        return {
            **validated.model_dump(),
            "guardrail_notes": notes
        }


