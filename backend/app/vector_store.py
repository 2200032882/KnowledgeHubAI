import chromadb


CHROMA_PATH = "chroma_db"

COLLECTION_NAME = "knowledgehub_documents"


client = chromadb.PersistentClient(
    path=CHROMA_PATH
)


collection = client.get_or_create_collection(
    name=COLLECTION_NAME,
    metadata={
        "hnsw:space": "cosine"
    }
)


def add_document_chunk(
    chunk_id: str,
    text: str,
    embedding,
    metadata: dict
):

    collection.upsert(
        ids=[chunk_id],
        documents=[text],
        embeddings=[
            embedding.tolist()
        ],
        metadatas=[metadata]
    )


def search_chunks(
    embedding,
    number_of_results: int = 3
):

    return collection.query(
        query_embeddings=[
            embedding.tolist()
        ],
        n_results=number_of_results,
        include=[
            "documents",
            "metadatas",
            "distances"
        ]
    )


def delete_document(
    document_id: int
):

    results = collection.get(
        where={
            "document_id": document_id
        }
    )

    ids = results.get(
        "ids",
        []
    )

    if ids:

        collection.delete(
            ids=ids
        )