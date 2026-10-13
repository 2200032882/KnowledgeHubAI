
import time
from ollama import chat, list as ollama_list

MODEL_NAME = "qwen3:1.7b"


def ensure_model_available():
    """Verify that the model is installed locally."""

    try:
        response = ollama_list()
        available_models = {
            model.model for model in response.models
        }

        if MODEL_NAME not in available_models:
            raise RuntimeError(
                f"{MODEL_NAME} is not installed. "
                "Run: ollama pull qwen3:1.7b"
            )

        print(f"[LLM] Model available: {MODEL_NAME}")

    except Exception as exc:
        raise RuntimeError(
            f"Could not connect to Ollama: {exc}"
        ) from exc


def _prepare_messages(system, messages):
    result = []

    if system and system.strip():
        result.append({
            "role": "system",
            "content": system.strip()
        })

    for message in messages:
        role = message.get("role", "user")
        content = (message.get("content") or "").strip()

        if content and role in ("user", "assistant"):
            result.append({
                "role": role,
                "content": content
            })

    return result


def stream_answer(system: str, messages: list):
    """Stream answers and keep the model loaded between questions."""

    if not messages:
        yield "Please enter a question."
        return

    ollama_messages = _prepare_messages(system, messages)

    if not ollama_messages:
        yield "Please enter a question."
        return

    start = time.perf_counter()
    first_token = True

    try:
        response = chat(
            model=MODEL_NAME,
            messages=ollama_messages,
            stream=True,
            think=False,
            keep_alive="30m",
            options={
                "temperature": 0,
                "seed": 42,
                "num_predict": 700,
                "num_ctx": 2048
            }
        )

        for chunk in response:
            content = chunk.get("message", {}).get("content", "")

            if content:
                if first_token:
                    print(
                        f"[LLM] First token: "
                        f"{time.perf_counter() - start:.2f}s"
                    )
                    first_token = False

                yield content

    except Exception as exc:
        print(f"[LLM] Generation error: {exc}")
        yield (
            "Sorry, I couldn't generate an answer. "
            "Please check whether Ollama is running."
        )


def generate_answer(
    system: str,
    messages: list,
    model: str = MODEL_NAME
) -> str:
    """Non-streaming generation for existing callers."""

    if not messages:
        return "Please enter a question."

    try:
        response = chat(
            model=model,
            messages=_prepare_messages(system, messages),
            think=False,
            keep_alive="30m",
            options={
                "temperature": 0,
                "seed": 42,
                "num_predict": 700,
                "num_ctx": 2048
            }
        )

        return response["message"]["content"].strip()

    except Exception as exc:
        print(f"[LLM] Generation error: {exc}")
        return "Sorry, I couldn't generate an answer."
