
from .embedding_service import generate_embedding
from .vector_store import add_document_chunk
from .pdf_reader import extract_text_from_pdf


def chunk_text(text, chunk_size=500):
    """Split extracted text into 500-character chunks."""

    chunks = []

    for i in range(0, len(text), chunk_size):
        chunk = text[i:i + chunk_size]

        if chunk.strip():
            chunks.append(chunk)

    return chunks


def process_document(document_id, filename, pdf_path, user_id):
    """Extract, chunk, embed, and index a PDF for its owner."""

    print(f"\nProcessing PDF: {filename}")

    # 1. Extract PDF text
    extracted_text = extract_text_from_pdf(pdf_path)

    print(f"Extracted characters: {len(extracted_text)}")

    if not extracted_text.strip():
        raise ValueError(
            "No text was extracted from the PDF. "
            "Check PDF extraction or OCR."
        )

    # 2. Create chunks
    chunks = chunk_text(extracted_text, chunk_size=500)

    print(f"Chunks created: {len(chunks)}")

    # 3. Generate embeddings and store chunks with ownership metadata
    for index, chunk in enumerate(chunks):
        embedding = generate_embedding(chunk)
        chunk_id = f"{document_id}_chunk_{index}"

        add_document_chunk(
            chunk_id=chunk_id,
            text=chunk,
            embedding=embedding,
            metadata={
                "document_id": document_id,
                "user_id": user_id,
                "filename": filename,
                "chunk_id": chunk_id,
                "chunk_index": index,
            },
        )

    print(f"Successfully indexed: {filename}\n")

    return {
        "document_id": document_id,
        "filename": filename,
        "chunks": len(chunks),
    }
