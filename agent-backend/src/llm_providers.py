"""Multi-provider structured LLM generation with automatic fallback.

The pipeline's single dependency on Gemini used to make a transient Gemini
outage (503 "high demand") or a hard daily quota (429) fatal for the whole
run. This module removes that single point of failure.

PRIMARY path: Gemini via ``google-genai`` native structured output
(``response_schema``) — the highest-fidelity route for our deeply-nested
``VideoRenderPayload`` (near-zero validation errors on nested schemas).

FALLBACKS: a chain of OpenAI-SDK-compatible providers (Groq, OpenRouter).
When Gemini is overloaded / rate-limited
— or ``GEMINI_API_KEY`` is unset — the next provider in the chain is tried,
with the Pydantic JSON schema injected into the system prompt and the returned
JSON validated against the same model. Providers whose API key is not
configured are skipped automatically, so this works with whatever subset of
keys you set up (even just Gemini, which reproduces the old behaviour).

Schema-agnostic: pass any ``pydantic.BaseModel`` subclass and get a validated
instance back. This file is shared VERBATIM by ``swe-youtube-agent`` and
``study-youtube-agent`` — keep the two copies in sync.

Configure via env (all optional; sane defaults):

  LLM_PROVIDER_ORDER   comma list, default "gemini_native,groq,openrouter"
  GEMINI_API_KEY       Gemini (google-genai native)      [GEMINI_MODEL]
  GROQ_API_KEY         Groq                              [GROQ_MODEL]
  OPENROUTER_API_KEY   OpenRouter                        [OPENROUTER_MODEL]
  LLM_MAX_INPUT_CHARS  truncate user content for the OpenAI-compat providers,
                       so Groq's free TPM limit never trips (default 8000)

Each provider also accepts a ``<NAME>_BASE_URL`` override if the endpoint moves.
"""

from __future__ import annotations

import json
import os
import re
import time
from typing import Type, TypeVar

from pydantic import BaseModel

try:
    from . import config
except ImportError:  # pragma: no cover
    import config  # type: ignore

T = TypeVar("T", bound=BaseModel)


# ---------------------------------------------------------------------------
# Provider registry (OpenAI-SDK-compatible). Gemini native is handled apart.
# ---------------------------------------------------------------------------
def _env(name: str, default: str) -> str:
    return os.getenv(name, default)


_OPENAI_COMPAT = {
    "groq": {
        "base_url": _env("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
        "key_envs": ("GROQ_API_KEY",),
        # gpt-oss-120b is Groq's current self-serve production model; the old
        # llama-3.3-70b-versatile is now enterprise-only.
        "model": _env("GROQ_MODEL", "openai/gpt-oss-120b"),
    },
    "openrouter": {
        "base_url": _env("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        "key_envs": ("OPENROUTER_API_KEY",),
        "model": _env("OPENROUTER_MODEL", "google/gemma-4-31b-it:free"),
    },
    # Gemini via its OpenAI-compat shim. Available for manual ordering but NOT in
    # the default chain, since `gemini_native` already covers Gemini (and if
    # Gemini is down, both would fail anyway).
    "gemini_openai": {
        "base_url": _env(
            "GEMINI_OPENAI_BASE_URL",
            "https://generativelanguage.googleapis.com/v1beta/openai/",
        ),
        "key_envs": ("GEMINI_API_KEY",),
        "model": _env("GEMINI_OPENAI_MODEL", getattr(config, "GEMINI_MODEL", "gemini-2.0-flash")),
    },
}

_DEFAULT_ORDER = "gemini_native,groq,openrouter"

# Transient conditions worth retrying the whole chain for.
_RETRYABLE_MARKERS = (
    "503", "UNAVAILABLE", "500", "502", "504",
    "OVERLOAD", "HIGH DEMAND", "429", "RESOURCE_EXHAUSTED",
    "RATE LIMIT", "RATELIMIT", "TOO MANY REQUESTS", "TIMEOUT", "TEMPORARILY",
)
_RETRY_DELAYS = (4, 10, 25, 60)  # seconds between whole-chain passes (~99s max)

_FENCE_OPEN = re.compile(r"^\s*```[a-zA-Z0-9]*\s*")
_FENCE_CLOSE = re.compile(r"\s*```\s*$")


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def _is_retryable(exc: Exception) -> bool:
    code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    if code in (500, 502, 503, 504, 429):
        return True
    msg = str(exc).upper()
    return any(m in msg for m in _RETRYABLE_MARKERS)


def _short(exc: Exception, n: int = 180) -> str:
    s = str(exc).replace("\n", " ").strip()
    return s[:n] + ("…" if len(s) > n else "")


def _first_key(key_envs) -> str | None:
    for name in key_envs:
        val = os.getenv(name)
        if val and val.strip() and not val.strip().lower().startswith("your_"):
            return val.strip()
    return None


def _max_input_chars() -> int:
    try:
        return int(os.getenv("LLM_MAX_INPUT_CHARS", "8000"))
    except ValueError:
        return 8000


def _provider_order() -> list[str]:
    raw = os.getenv("LLM_PROVIDER_ORDER", _DEFAULT_ORDER)
    return [p.strip() for p in raw.split(",") if p.strip()]


def configured_chain() -> list[str]:
    """The provider order filtered to those with an API key actually available."""
    chain: list[str] = []
    for name in _provider_order():
        if name == "gemini_native":
            if _first_key(("GEMINI_API_KEY",)):
                chain.append(name)
        else:
            cfg = _OPENAI_COMPAT.get(name)
            if cfg and _first_key(cfg["key_envs"]):
                chain.append(name)
    return chain


def _strip_fences(text: str) -> str:
    """Drop ```json ... ``` fences a model may add despite instructions."""
    t = text.strip()
    t = _FENCE_OPEN.sub("", t)
    t = _FENCE_CLOSE.sub("", t)
    return t.strip()


# ---------------------------------------------------------------------------
# The two call shapes
# ---------------------------------------------------------------------------
def _call_gemini_native(system_prompt: str, user_content: str, schema: Type[T], temperature: float) -> T:
    try:
        from google import genai  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("google-genai is not installed. `pip install google-genai`.") from exc
    client = genai.Client(api_key=_first_key(("GEMINI_API_KEY",)))
    resp = client.models.generate_content(
        model=getattr(config, "GEMINI_MODEL", "gemini-2.0-flash"),
        contents=[system_prompt, user_content],
        config={
            "response_mime_type": "application/json",
            "response_schema": schema,
            "temperature": temperature,
        },
    )
    return schema.model_validate_json(resp.text)


def _call_openai_compat(cfg: dict, system_prompt: str, user_content: str, schema: Type[T], temperature: float) -> T:
    try:
        from openai import OpenAI  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("openai is not installed. `pip install openai` to enable fallbacks.") from exc
    client = OpenAI(base_url=cfg["base_url"], api_key=_first_key(cfg["key_envs"]))
    schema_json = json.dumps(schema.model_json_schema())
    full_system = (
        f"{system_prompt}\n\n"
        "CRITICAL OUTPUT FORMAT: respond with ONLY a single valid JSON object "
        "(no markdown code fences, no commentary before or after) that strictly "
        f"conforms to this JSON Schema:\n{schema_json}"
    )
    trimmed = user_content[: _max_input_chars()]
    resp = client.chat.completions.create(
        model=cfg["model"],
        temperature=temperature,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": full_system},
            {"role": "user", "content": trimmed},
        ],
    )
    raw = (resp.choices[0].message.content or "").strip()
    if not raw:
        raise ValueError("provider returned an empty message")
    return schema.model_validate_json(_strip_fences(raw))


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def generate_structured(
    system_prompt: str,
    user_content: str,
    schema: Type[T],
    temperature: float = 0.8,
    label: str = "generation",
) -> T:
    """Generate a validated `schema` instance, trying providers in order.

    Tries each configured provider once per pass. If a whole pass fails with
    transient errors (overload / rate-limit / timeout), it backs off and
    retries the whole chain. Hard errors (e.g. a validation failure from one
    provider) fall through to the next provider immediately. Raises
    RuntimeError only when every configured provider is exhausted.
    """
    chain = configured_chain()
    if not chain:
        raise RuntimeError(
            "No LLM provider is configured. Set GEMINI_API_KEY (primary) or any "
            "of GROQ_API_KEY / OPENROUTER_API_KEY. See .env.example and "
            "LLM_PROVIDER_ORDER."
        )

    last_exc: Exception | None = None
    for attempt in range(len(_RETRY_DELAYS) + 1):
        saw_retryable = False
        for name in chain:
            try:
                if name == "gemini_native":
                    result = _call_gemini_native(system_prompt, user_content, schema, temperature)
                else:
                    result = _call_openai_compat(
                        _OPENAI_COMPAT[name], system_prompt, user_content, schema, temperature
                    )
                if name != chain[0] or attempt > 0:
                    print(f"[llm] {label}: recovered via fallback provider '{name}'.")
                return result
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                saw_retryable = saw_retryable or _is_retryable(exc)
                nxt = "next provider" if name != chain[-1] else "chain exhausted this pass"
                print(f"[llm] {label}: provider '{name}' failed ({_short(exc)}); {nxt}.")

        if attempt == len(_RETRY_DELAYS) or not saw_retryable:
            break
        wait = _RETRY_DELAYS[attempt]
        print(
            f"[llm] {label}: all {len(chain)} provider(s) failed on pass "
            f"{attempt + 1}; backing off {wait}s before retrying the chain..."
        )
        time.sleep(wait)

    raise RuntimeError(
        f"[llm] {label}: all configured providers failed "
        f"({', '.join(chain)}). Last error: {last_exc}"
    )
