
import os
import time
from google import genai
from google.genai import types

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")


def _get_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is missing from environment variables.")
    return genai.Client(api_key=api_key)


def _prepare_messages(system, messages):
    result = []

    for message in messages:
        role = message.get("role", "user")
        content = (message.get("content") or "").strip()

        if not content or role not in ("user", "assistant"):
            continue

        result.append({
            "role": "model" if role == "assistant" else "user",
            "parts": [{"text": content}],
        })

    return result


def ensure_model_available():
    """Check that the Gemini API key is configured."""
    _get_client()
    print(f"[LLM] Gemini configured with model: {MODEL_NAME}")


def stream_answer(system: str, messages: list):
    """Stream an answer from Gemini."""
    if not messages:
        yield "Please enter a question."
        return

    contents = _prepare_messages(system, messages)
    if not contents:
        yield "Please enter a question."
        return

    start = time.perf_counter()
    first_token = True

    try:
        client = _get_client()
        stream = client.models.generate_content_stream(
            model=MODEL_NAME,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system.strip() if system and system.strip() else None,
                temperature=0,
                max_output_tokens=700,
            ),
        )

        for chunk in stream:
            content = chunk.text or ""
            if content:
                if first_token:
                    print(f"[LLM] First token: {time.perf_counter() - start:.2f}s")
                    first_token = False
                yield content

    except Exception as exc:
        print(f"[LLM] Generation error: {exc}")
        yield "Sorry, I couldn't generate an answer. Please check the Gemini API configuration and model availability."


def generate_answer(system: str, messages: list, model: str = MODEL_NAME) -> str:
    """Non-streaming generation for existing callers."""
    if not messages:
        return "Please enter a question."

    contents = _prepare_messages(system, messages)
    if not contents:
        return "Please enter a question."

    try:
        client = _get_client()
        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system.strip() if system and system.strip() else None,
                temperature=0,
                max_output_tokens=700,
            ),
        )
        return (response.text or "").strip()

    except Exception as exc:
        print(f"[LLM] Generation error: {exc}")
        return "Sorry, I couldn't generate an answer."
