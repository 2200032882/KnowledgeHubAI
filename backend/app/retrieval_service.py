
from .vector_store import collection
from .embedding_service import generate_embedding


def search_similar_chunks(
    question: str,
    user_id: int,
    number_of_results: int = 3,
    distance_threshold: float = 0.65,
):
    """
    Search the KnowledgeHub vector database for chunks
    belonging only to the specified user.

    ChromaDB distance:
        Lower distance = more similar.
        Higher distance = less similar.

    Only results within the similarity threshold
    are considered relevant.
    """

    # Generate embedding for the user's question
    question_embedding = generate_embedding(question)

    # Search only chunks owned by this user
    results = collection.query(
        query_embeddings=[
            question_embedding.tolist()
        ],
        n_results=number_of_results,
        where={"user_id": user_id},
    )

    # Safely extract results
    ids = results.get("ids", [[]])[0]

    documents = results.get("documents", [[]])[0]

    distances = results.get("distances", [[]])[0]

    # Keep only genuinely relevant results
    filtered_ids = []
    filtered_documents = []
    filtered_distances = []

    for chunk_id, document, distance in zip(
        ids,
        documents,
        distances,
    ):
        if distance is not None and distance <= distance_threshold:
            filtered_ids.append(chunk_id)
            filtered_documents.append(document)
            filtered_distances.append(distance)

    # Return results in the existing format
    return {
        "ids": [filtered_ids],
        "documents": [filtered_documents],
        "distances": [filtered_distances],
    }
