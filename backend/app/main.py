
import json
import shutil
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .database import (
    SessionLocal,
    StudentDB,
    DocumentDB,
    UserDB,
    ChatConversationDB,
    ChatMessageDB,
    Base,
    engine,
)
from .auth_routes import router as auth_router, get_current_user
from .llm_service import ensure_model_available
from .rag_service import stream_rag_answer
from .document_service import process_document
from .vector_store import (
    collection,
    delete_document as delete_document_vectors,
)

app = FastAPI(title="KnowledgeHub AI", version="2.0.0")
app.include_router(auth_router)
Base.metadata.create_all(bind=engine)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class Student(BaseModel):
    name: str
    branch: str


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str
    history: list[ChatMessage] = Field(default_factory=list)



@app.on_event("startup")
def startup():
    print("Starting KnowledgeHub AI...")
    ensure_model_available()
    print("KnowledgeHub AI is ready.")



@app.get("/")
def root():
    return {
        "message": "KnowledgeHub AI is running",
        "version": "2.0.0",
        "llm": "qwen3.5:4b",
        "rag": True,
        "streaming": True,
    }


@app.get("/about")
def about():
    return {
        "application": "KnowledgeHub AI",
        "description": "Conversational AI with RAG",
        "model": "qwen3.5:4b",
    }


@app.get("/hello/{name}")
def hello(name: str):
    return {"message": f"Hello {name}"}


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "llm": "qwen3.5:4b",
        "rag": True,
        "streaming": True,
    }


@app.get("/students")
def get_students():
    db = SessionLocal()
    try:
        students = db.query(StudentDB).all()
        return [
            {
                "id": s.id,
                "name": s.name,
                "branch": s.branch,
            }
            for s in students
        ]
    finally:
        db.close()


@app.get("/student/{student_id}")
def get_student(student_id: int):
    db = SessionLocal()
    try:
        student = (
            db.query(StudentDB)
            .filter(StudentDB.id == student_id)
            .first()
        )
        if student is None:
            raise HTTPException(404, "Student not found.")

        return {
            "id": student.id,
            "name": student.name,
            "branch": student.branch,
        }
    finally:
        db.close()


@app.post("/students")
def create_student(student: Student):
    db = SessionLocal()
    try:
        new_student = StudentDB(
            name=student.name,
            branch=student.branch,
        )
        db.add(new_student)
        db.commit()
        db.refresh(new_student)

        return {
            "message": "Student created successfully.",
            "id": new_student.id,
            "name": new_student.name,
            "branch": new_student.branch,
        }
    finally:
        db.close()



@app.post("/ask")
def ask(
    request: ChatRequest,
    current_user=Depends(get_current_user),
):
    question = request.question.strip()

    if not question:
        raise HTTPException(400, "Question cannot be empty.")

    history = [
        {"role": message.role, "content": message.content}
        for message in request.history
    ]


    def generate():
        try:
            for token in stream_rag_answer(
    question=question,
    history=history,
    user_id=current_user.id,
):
                yield json.dumps({
                    "type": "token",
                    "content": token,
                }) + "\n"

            yield json.dumps({"type": "done"}) + "\n"

        except Exception as exc:
            print(f"ASK ERROR: {exc}")
            yield json.dumps({
                "type": "error",
                "content": "Answer generation failed. Check the backend terminal.",
            }) + "\n"

    return StreamingResponse(
        generate(),
        media_type="application/x-ndjson",
    )




@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(400, "No filename provided.")

    filename = Path(file.filename).name

    if Path(filename).suffix.lower() != ".pdf":
        raise HTTPException(400, "Only PDF files are supported.")

    file_path = UPLOAD_DIR / filename

    # Avoid overwriting an existing uploaded PDF.
    counter = 1
    while file_path.exists():
        file_path = (
            UPLOAD_DIR
            / f"{Path(filename).stem}_{counter}.pdf"
        )
        counter += 1

    document_id = None

    try:
        # Save the uploaded PDF.
        with file_path.open("wb") as output:
            shutil.copyfileobj(file.file, output)

        # Save the document record with its owner.
        db = SessionLocal()
        try:
            document = DocumentDB(
                title=file_path.stem,
                filename=file_path.name,
                document_type="PDF",
                user_id=current_user.id,
            )
            db.add(document)
            db.commit()
            db.refresh(document)
            document_id = document.id
        finally:
            db.close()

        # Extract, chunk, embed, and index the PDF.
        result = process_document(
            document_id=document_id,
            filename=file_path.name,
            pdf_path=str(file_path),
            user_id=current_user.id,
        )

        chunks_created = result["chunks"]

        return {
            "message": "Document uploaded successfully.",
            "document_id": document_id,
            "title": file_path.stem,
            "filename": file_path.name,
            "document_type": "PDF",
            "chunks": chunks_created,
            "chunks_created": chunks_created,
        }

    except Exception as exc:
        # Remove the database record if processing failed.
        if document_id is not None:
            db = SessionLocal()
            try:
                document = (
                    db.query(DocumentDB)
                    .filter(
                        DocumentDB.id == document_id,
                        DocumentDB.user_id == current_user.id,
                    )
                    .first()
                )
                if document:
                    db.delete(document)
                    db.commit()
            finally:
                db.close()

            try:
                delete_document_vectors(document_id)
            except Exception:
                pass

        # Remove the uploaded file if processing failed.
        try:
            file_path.unlink(missing_ok=True)
        except Exception:
            pass

        raise HTTPException(
            status_code=500,
            detail=f"Document processing failed: {exc}",
        )
@app.get("/documents")
def get_documents(
    current_user=Depends(get_current_user),
):
    db = SessionLocal()
    try:
        documents = (
            db.query(DocumentDB)
            .filter(
                DocumentDB.user_id == current_user.id
            )
            .order_by(DocumentDB.uploaded_at.desc())
            .all()
        )
        

        return [
            {
                "id": document.id,
                "title": document.title,
                "filename": document.filename,
                "document_type": document.document_type,
                "uploaded_at": (
                    document.uploaded_at.isoformat()
                    if document.uploaded_at
                    else None
                ),
                "chunks": len(
                    collection.get(
                        where={"document_id": document.id},
                        include=[],
                    ).get("ids", [])
                ),
            }
            for document in documents
        ]

    finally:
        db.close()
    


@app.get("/documents/{document_id}")
def get_document(
    

    document_id: int,
    current_user=Depends(get_current_user),
):
    db = SessionLocal()
    try:
        

        document = (
            db.query(DocumentDB)
            .filter(
                DocumentDB.id == document_id,
                DocumentDB.user_id == current_user.id,
            )
            .first()
        )

        if document is None:
            raise HTTPException(404, "Document not found.")

        try:
            vector_data = collection.get(
                where={"document_id": document.id},
                include=[],
            )
            chunk_count = len(vector_data.get("ids", []))
        except Exception:
            chunk_count = 0

        return {
            "id": document.id,
            "title": document.title,
            "filename": document.filename,
            "document_type": document.document_type,
            "uploaded_at": (
                document.uploaded_at.isoformat()
                if document.uploaded_at
                else None
            ),
            "chunks": chunk_count,
        }
    finally:
        db.close()


@app.delete("/documents/{document_id}")
def delete_document(
    document_id: int,
    current_user=Depends(get_current_user),
):
    
    db = SessionLocal()
    try:
        document = (
            db.query(DocumentDB)
            .filter(
                DocumentDB.id == document_id,
                DocumentDB.user_id == current_user.id,
            )
            .first()
        )

        if document is None:
            raise HTTPException(404, "Document not found.")

        filename = document.filename

        # Delete vectors first.
        delete_document_vectors(document_id)

        file_path = UPLOAD_DIR / filename
        if file_path.exists():
            file_path.unlink()

        db.delete(document)
        db.commit()

        return {
            "message": "Document deleted successfully.",
            "document_id": document_id,
        }
    finally:
        db.close()
