
import time

from .retrieval_service import search_similar_chunks
from .llm_service import stream_answer


SYSTEM_PROMPT = """
IDENTITY:
- Your name is Ollie.
- You are the AI assistant inside KnowledgeHub AI.
- You were created by Ananya Siram for KnowledgeHub AI.
- When asked about yourself, introduce yourself as Ollie.
- When asked who created you, say Ananya Siram created you
  for KnowledgeHub AI.
- When asked what you do, explain that you help users understand
  uploaded documents, answer questions, and have conversations.
- Never introduce yourself as Qwen or Alibaba Cloud's model.
- Qwen3:1.7b is the underlying language model, not your identity.
- Do not claim Ananya created the underlying Qwen model.

DOCUMENT-GROUNDED ANSWERS:
- When document excerpts are provided, use them as the primary source.
- Answer the current question directly and clearly.
- Describe document contents only using facts supported by excerpts.
- Do not invent facts, examples, statistics, or document contents.
- If excerpts do not contain enough information, say so clearly.
- Preserve the document's terminology and meaning.
- Distinguish document facts from general knowledge when necessary.

CONVERSATION HISTORY:
- Use previous messages to understand follow-up questions.
- Only claim the user said something if it appears in the history.
- Use earlier messages to resolve follow-up references.
- Do not confuse conversation history with document evidence.
- Use only conversation history supplied to you.
- Do not claim to remember information that is unavailable.

GENERAL QUESTIONS:
- Answer general questions using appropriate general knowledge
  when document evidence is not required.

FORMATTING:
- Use Markdown headings and bullet points when useful.
- Keep answers clear, concise, and complete.
- Finish sentences and avoid unnecessary repetition.

Never claim to have read content that was not supplied.
Do not mention embeddings or internal implementation details.
"""


def get_identity_answer(question: str):
    """Return fixed answers for common identity questions."""

    text = question.lower().strip().rstrip("?!.")

    name_questions = {
        "what is your name",
        "what's your name",
        "whats your name",
        "hey whats your name",
        "hey what is your name",
        "hey what's your name",
        "your name",
        "who are you",
        "tell me your name",
    }

    creator_questions = {
        "who created you",
        "who made you",
        "who is your creator",
        "who's your creator",
        "who is your creator?",
        "who created knowledgehub ai",
        "who made knowledgehub ai",
        "who developed you",
    }

    if text in name_questions:
        return "I'm Ollie, your KnowledgeHub AI assistant."

    if text in creator_questions:
        return (
            "I was created by Ananya Siram for KnowledgeHub AI."
        )

    return None


def is_conversation_question(question: str) -> bool:
    text = question.lower().strip().rstrip("?!.")

    conversation_phrases = (
        "what did i tell you",
        "what did i just tell you",
        "what did i ask you to remember",
        "what did i tell you to remember",
        "what did i say earlier",
        "what did i say before",
        "what did i mention earlier",
        "what do you remember about me",
        "what is my project called",
        "what is the name of my project",
        "what was my previous question",
        "what did we discuss",
        "what is your name",
        "what's your name",
        "whats your name",
        "your name",
        "who are you",
        "who created you",
        "who made you",
        "who is your creator",
        "who's your creator",
        "who created knowledgehub ai",
        "who made knowledgehub ai",
    )

    document_phrases = (
        "explain that pdf",
        "explain this pdf",
        "explain the pdf",
        "summarize this document",
        "summarize that document",
        "summarize this pdf",
        "summarize the pdf",
        "explain this document",
        "explain that document",
        "main points in this pdf",
        "main points of this pdf",
        "what is in this pdf",
        "what does this pdf say",
    )

    if any(phrase in text for phrase in document_phrases):
        return False

    return any(
        phrase in text for phrase in conversation_phrases
    )


def retrieve_context(question: str, user_id: int):
    start = time.perf_counter()

    results = search_similar_chunks(
        question=question,
        user_id=user_id,
        number_of_results=3,
        distance_threshold=0.65,
    )

    documents = results.get("documents", [[]])[0]
    distances = results.get("distances", [[]])[0]
    ids = results.get("ids", [[]])[0]

    relevant = []

    for index, document in enumerate(documents):
        if not document or not document.strip():
            continue

        distance = (
            distances[index]
            if index < len(distances)
            else None
        )

        chunk_id = (
            ids[index]
            if index < len(ids)
            else ""
        )

        if distance is not None and distance <= 0.65:
            relevant.append({
                "text": document,
                "chunk_id": chunk_id,
                "distance": distance,
            })

    print(
        f"[RAG] Retrieval: "
        f"{time.perf_counter() - start:.3f}s | "
        f"User: {user_id} | "
        f"Retrieved chunks: {len(relevant)}"
    )

    return relevant


def build_messages(
    question: str,
    history=None,
    user_id: int = None,
):
    if history is None:
        history = []

    messages = []

    # Include recent conversation history.
    for message in history[-4:]:
        role = message.get("role", "user")
        content = (message.get("content") or "").strip()

        if role in ("user", "assistant") and content:
            messages.append({
                "role": role,
                "content": content,
            })

    chunks = []

    # Retrieve document context for questions that need it.
    if not is_conversation_question(question):
        if user_id is None:
            raise ValueError(
                "An authenticated user ID is required."
            )

        chunks = retrieve_context(question, user_id)

    sources = []
    user_content = question

    if chunks:
        context_parts = []

        for index, chunk in enumerate(chunks, start=1):
            context_parts.append(
                f"[Document excerpt {index}]\n"
                f"Content:\n{chunk['text']}"
            )

            sources.append({
                "chunk_id": chunk["chunk_id"],
                "distance": chunk["distance"],
            })

        context = "\n\n".join(context_parts)

        user_content = (
            f"Current question:\n{question}\n\n"
            f"Uploaded document excerpts:\n{context}\n\n"
            "Answer using the supplied excerpts as the primary "
            "source. Do not invent document facts. If the excerpts "
            "do not contain the answer, say so clearly."
        )

    messages.append({
        "role": "user",
        "content": user_content,
    })

    return messages, sources


def stream_rag_answer(
    question: str,
    history=None,
    user_id: int = None,
):
    # Answer identity questions directly for consistent results.
    identity_answer = get_identity_answer(question)

    if identity_answer:
        yield identity_answer
        return

    messages, sources = build_messages(
        question=question,
        history=history,
        user_id=user_id,
    )

    print(
        f"[RAG] Sources supplied to LLM: {len(sources)}"
    )

    yield from stream_answer(
        SYSTEM_PROMPT,
        messages,
    )
