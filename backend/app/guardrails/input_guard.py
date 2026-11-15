# Injection Blocker + PII/Secret Redactor

import re
from dataclasses import dataclass, field


class SecurityViolationError(Exception):
    """Raised when an input violates safety or prompt-injection policies"""

    def __init__(self, reason: str, matched_rules: str):
        self.reason = reason
        self.matched_rules = matched_rules
        super().__init__(reason)


@dataclass
class SanitizedInput:
    clean_text: str
    redacted_categories: list[str] = field(default_factory=list)
    was_modified: bool = False


# Pre-compiled injection patterns (fast O(n) scan, zero RAM overhead)
INJECTION_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("instruction_override", re.compile(
        r"ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)", re.I)),
    ("system_prompt_leak", re.compile(
        r"(reveal|show|print|output|repeat)\s+(your\s+)?(system\s+prompt|initial\s+instructions|developer\s+message)", re.I)),
    ("jailbreak_persona", re.compile(
        r"(you\s+are\s+now\s+DAN|do\s+anything\s+now|jailbreak\s+mode|developer\s+mode\s+enabled)", re.I)),
    ("delimiter_spoofing", re.compile(
        r"(<\|im_start\|>|<\|system\|>|\[INST\]|###\s*System\s*:)", re.I)),
]


# Pre-compiled PII & Secret patterns
PII_PATTERNS: list[tuple[str, re.Pattern, str]] = [
    ("EMAIL", re.compile(
        r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b"), "[EMAIL_REDACTED]"),
    ("API_KEY", re.compile(
        r"\b(sk-[a-zA-Z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}|gsk_[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16})\b"), "[API_KEY_REDACTED]"),
    ("PHONE", re.compile(
        r"(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"), "[PHONE_REDACTED]"),
    ("SSN", re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[SSN_REDACTED]"),
    ("AADHAAR", re.compile(
        r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"), "[NATIONAL_ID_REDACTED]"),
    ("PAN", re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b"), "[TAX_ID_REDACTED]"),
]


def run_input_guardrails(user_text: str) -> SanitizedInput:
    """
    1. Blocks prompt injection attempts before touching any LLM
    2. Masks PII and API secrets so sensitive data never leaves our servers
    """

    # check 1: Prompt Injection Shield
    for rule_name, pattern in INJECTION_PATTERNS:
        if pattern.search(user_text):
            raise SecurityViolationError(
                reason='Request blocked by input security guardrails: potential prompt injection detected.',
                matched_rules=rule_name
            )

    # check 2: PII and secret Redaction
    sanitized = user_text
    redacted_types: list[str] = []

    for category, pattern, replacement in PII_PATTERNS:
        if pattern.search(sanitized):
            sanitized = pattern.sub(replacement, sanitized)
            redacted_types.append(category)

    return SanitizedInput(
        clean_text=sanitized,
        redacted_categories = redacted_types,
        was_modified= len(redacted_types) > 0
    )