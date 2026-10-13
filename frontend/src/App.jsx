import { useEffect, useMemo, useRef, useState } from "react";

import "./App.css";

import ReactMarkdown from "react-markdown";

import remarkGfm from "remark-gfm";





const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";



// Decode the JWT payload only to namespace browser-local history by account.
// This is not authentication; the backend must enforce access to protected data.
function getChatHistoryKey(accessToken) {
  if (!accessToken) return null;
  try {
    const payloadPart = accessToken.split(".")[1];
    if (!payloadPart) return null;
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64));
    const identifier = payload.sub ?? payload.user_id ?? payload.email;
    if (identifier === undefined || identifier === null || identifier === "") return null;
    return `knowledgehub_chat_history_${encodeURIComponent(String(identifier).toLowerCase())}`;
  } catch (error) {
    console.error("Could not identify account for chat history:", error);
    return null;
  }
}

function App() {

  const [token, setToken] = useState(

  () => sessionStorage.getItem("knowledgehub_token") || ""

);

const [authMode, setAuthMode] = useState("login");

const [authName, setAuthName] = useState("");

const [authEmail, setAuthEmail] = useState("");

const [authPassword, setAuthPassword] = useState("");

const [authError, setAuthError] = useState("");

const [authLoading, setAuthLoading] = useState(false);

  const [documents, setDocuments] = useState([]);

  const [documentCount, setDocumentCount] = useState(0);

  const [loadingDocuments, setLoadingDocuments] = useState(false);

  const [documentsError, setDocumentsError] = useState("");



  const [selectedFile, setSelectedFile] = useState(null);

  const [dragActive, setDragActive] = useState(false);

  const [uploading, setUploading] = useState(false);

  const [uploadMessage, setUploadMessage] = useState("");



  const [question, setQuestion] = useState("");

  const [asking, setAsking] = useState(false);

  const [answer, setAnswer] = useState(null);const [showProfileMenu, setShowProfileMenu] = useState(false);



function handleLogout() {

  sessionStorage.removeItem("knowledgehub_token");

  setToken("");
  setChatHistory([]);
setAnswer(null);

  setShowProfileMenu(false);

  setDocuments([]);

  setAuthMode("login");

  setAuthName("");

  setAuthEmail("");

  setAuthPassword("");

  setAuthError("");

}



const [chatHistory, setChatHistory] = useState([]);
  const [chatHistoryStorageKey, setChatHistoryStorageKey] = useState(null);
  const [chatHistoryReady, setChatHistoryReady] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");

  const [selectedDocument, setSelectedDocument] = useState(null);



  const fileInputRef = useRef(null);

  const uploadSectionRef = useRef(null);



  const handleAuth = async (e) => {

    e.preventDefault();

    setAuthError("");

    setAuthLoading(true);



    try {

      if (authMode === "register") {

        const registerResponse = await fetch(

          `${API_URL}/auth/register`,

          {

            method: "POST",

            headers: {

              "Content-Type": "application/json",

            },

            body: JSON.stringify({

              name: authName.trim(),

              email: authEmail.trim(),

              password: authPassword,

            }),

          }

        );



        const registerData = await registerResponse.json();



        if (!registerResponse.ok) {

          throw new Error(

            registerData.detail || "Registration failed."

          );

        }

      }



      const loginResponse = await fetch(`${API_URL}/auth/login`, {

        method: "POST",

        headers: {

          "Content-Type": "application/x-www-form-urlencoded",

        },

        body: new URLSearchParams({

          username: authEmail.trim(),

          password: authPassword,

        }),

      });



      const loginData = await loginResponse.json();



      if (!loginResponse.ok) {

        throw new Error(loginData.detail || "Login failed.");

      }



      sessionStorage.setItem(

        "knowledgehub_token",

        loginData.access_token

      );



      setToken(loginData.access_token);

      setAuthPassword("");

    } catch (error) {

      setAuthError(error.message || "Authentication failed.");

    } finally {

      setAuthLoading(false);

    }

  };



  /* =========================

     LOAD DOCUMENTS

  ========================= */



  const loadDocuments = async () => {

    if (!token) {

      setDocuments([]);

      setDocumentCount(0);

      return;

    }



    setLoadingDocuments(true);

    setDocumentsError("");



    try {

      const response = await fetch(`${API_URL}/documents`, {

        headers: {

          Authorization: `Bearer ${token}`,

        },

      });



      if (!response.ok) {

        throw new Error("Could not load documents.");

      }



      const data = await response.json();



      setDocuments(Array.isArray(data) ? data : data.documents || []);

      setDocumentCount(

        Array.isArray(data) ? data.length : data.total || 0

      );

    } catch (error) {

      setDocumentsError(error.message || "Could not load documents.");

    } finally {

      setLoadingDocuments(false);

    }

  };



  useEffect(() => {

    loadDocuments();

  }, [token]);







  useEffect(() => {

    loadDocuments();

  }, []);



// Load only this signed-in account's history. Never read the old shared key.
  useEffect(() => {
    const storageKey = getChatHistoryKey(token);
    setChatHistoryReady(false);
    setChatHistoryStorageKey(storageKey);

    if (!token) {
      setChatHistory([]);
      setChatHistoryReady(true);
      return;
    }

    if (!storageKey) {
      setChatHistory([]);
      setChatHistoryReady(true);
      return;
    }

    try {
      const savedHistory = localStorage.getItem(storageKey);
      const parsedHistory = savedHistory ? JSON.parse(savedHistory) : [];
      setChatHistory(Array.isArray(parsedHistory) ? parsedHistory : []);
    } catch (error) {
      console.error("Could not load conversation history:", error);
      setChatHistory([]);
    } finally {
      setChatHistoryReady(true);
    }
  }, [token]);

  useEffect(() => {
    if (!token || !chatHistoryStorageKey || !chatHistoryReady) return;
    try {
      localStorage.setItem(chatHistoryStorageKey, JSON.stringify(chatHistory));
    } catch (error) {
      console.error("Could not save conversation history:", error);
    }
  }, [chatHistory, chatHistoryStorageKey, chatHistoryReady, token]);





  /* =========================

     FILE SELECTION

  ========================= */



  const validateAndSelectFile = (file) => {

    if (!file) return;



    const isPdf =

      file.type === "application/pdf" ||

      file.name.toLowerCase().endsWith(".pdf");



    if (!isPdf) {

      setUploadMessage("Please select a PDF file.");

      return;

    }



    setSelectedFile(file);

    setUploadMessage("");

  };



  const handleFileChange = (event) => {

    const file = event.target.files?.[0];

    validateAndSelectFile(file);

  };



  const handleDrop = (event) => {

    event.preventDefault();

    setDragActive(false);



    const file = event.dataTransfer.files?.[0];

    validateAndSelectFile(file);

  };



  /* =========================

     UPLOAD

  ========================= */



  const handleUpload = async () => {

    if (!token || !selectedFile || uploading) return;



    setUploading(true);

    setUploadMessage("");



    try {

      const formData = new FormData();

      formData.append("file", selectedFile);



      const response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });



      const data = await response.json();



      if (!response.ok) {

        throw new Error(data.detail || "Upload failed.");

      }



      setUploadMessage(

        `Successfully processed ${selectedFile.name}. ${

          data.chunks_created || 0

        } chunks created.`

      );



      setSelectedFile(null);



      if (fileInputRef.current) {

        fileInputRef.current.value = "";

      }



      await loadDocuments();

    } catch (error) {

      setUploadMessage(

        error.message ||

          "Upload failed. Please check that FastAPI is running."

      );

    } finally {

      setUploading(false);

    }

  };



  const openFilePicker = () => {

    fileInputRef.current?.click();

  };



  /* =========================

     DELETE DOCUMENT

  ========================= */



  const handleDeleteDocument = async (documentId) => {

    const confirmed = window.confirm(

      "Are you sure you want to delete this document?\n\nThis will also remove its stored vector chunks."

    );



    if (!confirmed) return;



    try {

      const response = await fetch(

        `${API_URL}/documents/${documentId}`,

        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );



      const data = await response.json();



      if (!response.ok) {

        throw new Error(data.detail || "Delete failed.");

      }



      if (selectedDocument?.id === documentId) {

        setSelectedDocument(null);

      }



      await loadDocuments();

    } catch (error) {

      setDocumentsError(

        error.message || "Could not delete the document."

      );

    }

  };



  /* =========================

     ASK AI

  ========================= */



  const handleAsk = async () => {

    const trimmedQuestion = question.trim();



    if (!trimmedQuestion || asking) return;



    setAsking(true);



    /*

     * Show an empty answer immediately.

     * The backend will stream the answer token-by-token.

     */

    setAnswer({

      answer: "",

      sources: [],

    });



    try {

      const recentChatHistory = chatHistory.slice(-2);



      const history = recentChatHistory.flatMap((item) => [

        {

          role: "user",

          content: item.question,

        },

        {

          role: "assistant",

          content: item.answer,

        },

      ]);





const response = await fetch(`${API_URL}/ask`, {

  method: "POST",

  headers: {

    "Content-Type": "application/json",

    Authorization: `Bearer ${token}`,

  },



        body: JSON.stringify({

          question: trimmedQuestion,

          history: history,

        }),

      });



      if (!response.ok) {

        let errorMessage = "Question request failed.";



        try {

          const errorData = await response.json();

          errorMessage =

            errorData.detail || errorData.message || errorMessage;

        } catch {

          // Keep the default error message.

        }



        throw new Error(errorMessage);

      }



      if (!response.body) {

        throw new Error("The backend did not return a streaming response.");

      }



      const reader = response.body.getReader();

      const decoder = new TextDecoder("utf-8");



      let buffer = "";

      let streamedAnswer = "";



      const processLine = (line) => {

        const trimmedLine = line.trim();



        if (!trimmedLine) return;



        try {

          const event = JSON.parse(trimmedLine);



          if (event.type === "token") {

            const token = event.content || "";



            streamedAnswer += token;



            setAnswer((previous) => ({

              ...(previous || {}),

              answer: streamedAnswer,

              sources: previous?.sources || [],

            }));

          }

        } catch (parseError) {

          console.warn(

            "Could not parse streaming response:",

            parseError

          );

        }

      };



      while (true) {

        const { value, done } = await reader.read();



        if (done) break;



        buffer += decoder.decode(value, {

          stream: true,

        });



        const lines = buffer.split("\n");



        buffer = lines.pop() || "";



        for (const line of lines) {

          processLine(line);

        }

      }



      buffer += decoder.decode();



      if (buffer.trim()) {

        processLine(buffer);

      }



      if (!streamedAnswer.trim()) {

        streamedAnswer = "No answer returned.";



        setAnswer({

          answer: streamedAnswer,

          sources: [],

        });

      }



      const chatItem = {

        question: trimmedQuestion,

        answer: streamedAnswer,

      };



      setChatHistory((previous) => [

        ...previous.slice(-4),

        chatItem,

      ]);



      setQuestion("");

    } catch (error) {

      console.error("KnowledgeHub AI error:", error);



      setAnswer({

        answer:

          error.message ||

          "Could not connect to the AI backend. Please make sure FastAPI and Ollama are running.",

        sources: [],

      });

    } finally {

      setAsking(false);

    }

  };



  const handleQuestionKeyDown = (event) => {

    if (event.key === "Enter" && !event.shiftKey) {

      event.preventDefault();

      handleAsk();

    }

  };



  const clearChat = () => {

    setAnswer(null);

    setChatHistory([]);

  };



  /* =========================

     NAVIGATION

  ========================= */



  const scrollToSection = (section) => {

    if (section === "upload") {

      uploadSectionRef.current?.scrollIntoView({

        behavior: "smooth",

        block: "center",

      });

    }



    if (section === "documents") {

      document

        .getElementById("documents-section")

        ?.scrollIntoView({

          behavior: "smooth",

          block: "center",

        });

    }



    if (section === "ask") {

      document

        .getElementById("ask-section")

        ?.scrollIntoView({

          behavior: "smooth",

          block: "center",

        });

    }

  };



  /* =========================

     SEARCH

  ========================= */



  const filteredDocuments = useMemo(() => {

    const search = searchTerm.trim().toLowerCase();



    if (!search) return documents;



    return documents.filter((document) =>

      document.filename?.toLowerCase().includes(search)

    );

  }, [documents, searchTerm]);



  /* =========================

     STATISTICS

  ========================= */



  const totalChunks = documents.reduce(

    (total, document) => total + (document.chunks || 0),

    0

  );



  /* =========================

     RENDER

  ========================= */



return (

  !token ? (

    <div className="auth-container">

      <form onSubmit={handleAuth} className="auth-form">

        <h2>KnowledgeHub AI</h2>

        <p>{authMode === "login" ? "Welcome back" : "Create your account"}</p>



        {authMode === "register" && (

          <input

            type="text"

            placeholder="Full name"

            value={authName}

            onChange={(e) => setAuthName(e.target.value)}

            required

          />

        )}



        <input

          type="email"

          placeholder="Email address"

          value={authEmail}

          onChange={(e) => setAuthEmail(e.target.value)}

          required

        />



        <input

          type="password"

          placeholder="Password (minimum 8 characters)"

          value={authPassword}

          onChange={(e) => setAuthPassword(e.target.value)}

          minLength={8}

          required

        />



        {authError && <p className="auth-error">{authError}</p>}



        <button type="submit" disabled={authLoading}>

          {authLoading ? "Please wait..." : authMode === "login" ? "Log in" : "Register"}

        </button>



        <p>

          {authMode === "login" ? "Don't have an account?" : "Already registered?"}

          <button

            type="button"

            onClick={() => {

              setAuthMode(authMode === "login" ? "register" : "login");

              setAuthError("");

            }}

          >

            {authMode === "login" ? "Register" : "Log in"}

          </button>

        </p>

      </form>

    </div>

  ) : (

    <div className="app">



      {/* =========================

          SIDEBAR

      ========================= */}



      <aside className="sidebar">



        <div className="brand">

          <div className="brand-icon">

            KH

          </div>



          <div>

            <h2>KnowledgeHub</h2>

            <span>AI Knowledge Platform</span>

          </div>

        </div>



        <div className="sidebar-label">

          WORKSPACE

        </div>



        <nav className="sidebar-nav">



          <button

            className="nav-item active"

            onClick={() =>

              window.scrollTo({

                top: 0,

                behavior: "smooth",

              })

            }

          >

            <span className="nav-icon">✦</span>

            Overview

          </button>



          <button

            className="nav-item"

            onClick={() => scrollToSection("documents")}

          >

            <span className="nav-icon">▣</span>

            Documents

          </button>



          <button

            className="nav-item"

            onClick={() => scrollToSection("ask")}

          >

            <span className="nav-icon">✧</span>

            Ask AI

          </button>



        </nav>



        <div className="sidebar-promo">



          <div className="promo-icon">

            ✦

          </div>



          <strong>AI Knowledge</strong>



          <p>

            Your documents are ready to be explored.

          </p>



        </div>



        <div className="sidebar-bottom">



          <div className="system-status">

            <span className="status-dot"></span>



            <div>

              <strong>System Online</strong>

              <small>RAG engine active</small>

            </div>

          </div>



        </div>



      </aside>



      {/* =========================

          MAIN

      ========================= */}



      <main className="main">



        {/* TOP BAR */}



        <header className="topbar">



          <div className="breadcrumb">

            Workspace <span>/</span> KnowledgeHub

          </div>



          <div className="topbar-right">



            <div className="engine-status">

              <span></span>

              Ollie · RAG

            </div>



<div className="profile-menu">

  <button

    type="button"

    className="profile-avatar"

    onClick={() => setShowProfileMenu((prev) => !prev)}

    aria-label="Open profile menu"

  >

    A

  </button>



  {showProfileMenu && (

    <div className="profile-dropdown">

      <button type="button" onClick={handleLogout}>

        <span>↪</span> Logout

      </button>

    </div>

  )}

</div>



          </div>



        </header>



        <div className="content">



          {/* =========================

              HERO

          ========================= */}



          <section className="hero">



            <div className="hero-grid"></div>



            <div className="hero-content">



              <div className="eyebrow">

                ✦ AI KNOWLEDGE PLATFORM

              </div>



              <h1>

                Turn scattered

                <br />

                <span>knowledge</span>

                into answers.

              </h1>



              <p>

                Upload your documents, connect your knowledge,

                and ask questions in natural language.

                KnowledgeHub retrieves the right context before

                generating every answer.

              </p>



              <div className="hero-actions">



                <button

                  className="hero-primary"

                  onClick={() => scrollToSection("ask")}

                >

                  Ask your knowledge

                  <span>→</span>

                </button>



                <button

                  className="hero-secondary"

                  onClick={() => scrollToSection("documents")}

                >

                  Explore documents

                </button>



              </div>



            </div>



            {/* FLOATING AI CARD */}



            <div className="floating-ai-card">



              <div className="floating-top">



                <span className="floating-ai-icon">

                  ✦

                </span>



                <span className="floating-label">

                  KNOWLEDGE AI

                </span>



                <span className="live-label">

                  LIVE

                </span>



              </div>



              <h3>

                What does my

                <br />

                knowledge base say?

              </h3>



              <div className="context-box">



                <div className="context-icon">

                  AI

                </div>



                <div>

                  <strong>Context found</strong>



                  <small>

                    {documents.length

                      ? `${Math.min(

                          totalChunks,

                          3

                        )} relevant sources retrieved`

                      : "Waiting for documents"}

                  </small>

                </div>



              </div>



              <div className="fake-lines">

                <span></span>

                <span></span>

                <span></span>

              </div>



            </div>



            <div className="hero-orb orb-one"></div>

            <div className="hero-orb orb-two"></div>



          </section>



          {/* =========================

              STATS

          ========================= */}



          <section className="stats">



            <div className="stat-card stat-highlight">



              <div className="stat-number">

                {loadingDocuments

                  ? "—"

                  : String(documentCount).padStart(2, "0")}

              </div>



              <div>

                <span>Documents</span>

                <small>in knowledge base</small>

              </div>



            </div>



            <div className="stat-card">



              <div className="stat-symbol">

                ◇

              </div>



              <div>

                <strong>{totalChunks}</strong>

                <span>Chunks</span>

                <small>semantic units</small>

              </div>



            </div>



            <div className="stat-card">



              <div className="stat-symbol">

                ✦

              </div>



              <div>

                <strong>Qwen</strong>

                <span>Local language model</span>

                <small>RAG generation</small>

              </div>



            </div>



          </section>



          {/* =========================

              UPLOAD

          ========================= */}



          <section

            className="section-block"

            ref={uploadSectionRef}

          >



            <div className="section-title-row">



              <div>



                <span className="section-label">

                  01 · DOCUMENT INGESTION

                </span>



                <h2>

                  Feed your knowledge base.

                </h2>



              </div>



              <span className="section-note">

                PDF · OCR · Chunking · Embeddings

              </span>



            </div>



            <div className="upload-panel">



              <input

                ref={fileInputRef}

                type="file"

                accept=".pdf,application/pdf"

                onChange={handleFileChange}

                hidden

              />



              <div

                className={`dropzone ${

                  dragActive ? "drag-active" : ""

                } ${

                  selectedFile ? "has-file" : ""

                }`}

                onDragOver={(event) => {

                  event.preventDefault();

                  setDragActive(true);

                }}

                onDragLeave={() =>

                  setDragActive(false)

                }

                onDrop={handleDrop}

                onClick={openFilePicker}

              >



                <div className="upload-circle">



                  {selectedFile ? (

                    <span>✓</span>

                  ) : (

                    <span>↑</span>

                  )}



                </div>



                {selectedFile ? (

                  <>

                    <h3>

                      {selectedFile.name}

                    </h3>



                    <p>

                      PDF selected · click to choose another

                    </p>

                  </>

                ) : (

                  <>

                    <h3>

                      Drop your PDF here

                    </h3>



                    <p>

                      or choose a file from your computer

                    </p>

                  </>

                )}



                <button

                  className="choose-button"

                  type="button"

                  onClick={(event) => {

                    event.stopPropagation();

                    openFilePicker();

                  }}

                >

                  {selectedFile

                    ? "Change PDF"

                    : "Choose PDF"}

                </button>



              </div>



              <div className="upload-footer">



                <div className="pipeline">



                  <div>

                    <span>01</span>

                    Extract

                  </div>



                  <i>→</i>



                  <div>

                    <span>02</span>

                    Chunk

                  </div>



                  <i>→</i>



                  <div>

                    <span>03</span>

                    Embed

                  </div>



                  <i>→</i>



                  <div>

                    <span>04</span>

                    Store

                  </div>



                </div>



                <button

                  className="process-button"

                  onClick={handleUpload}

                  disabled={!selectedFile || uploading}

                >

                  {uploading ? (

                    <>

                      <span className="spinner"></span>

                      Processing

                    </>

                  ) : (

                    <>

                      Process document

                      <span>→</span>

                    </>

                  )}

                </button>



              </div>



              {uploadMessage && (

                <div

                  className={`upload-message ${

                    uploadMessage

                      .toLowerCase()

                      .includes("failed") ||

                    uploadMessage

                      .toLowerCase()

                      .includes("please")

                      ? "error"

                      : "success"

                  }`}

                >

                  {uploadMessage}

                </div>

              )}



            </div>



          </section>



          {/* =========================

              ASK AI

          ========================= */}



          <section

            className="section-block"

            id="ask-section"

          >



            <div className="section-title-row">



              <div>



                <span className="section-label">

                  02 · RETRIEVAL AUGMENTED GENERATION

                </span>



                <h2>

                  Ask your knowledge.

                </h2>



              </div>



              <span className="section-note">

                Answers grounded in your documents.

              </span>



            </div>



            <div className="ask-panel">



              <div className="ask-header">



                <div className="ai-square">

                  ✦

                </div>



                <div>

                  <strong>

                    KnowledgeHub AI

                  </strong>



                  <span>

                    Ask anything about your uploaded knowledge.

                  </span>

                </div>



                <div className="ask-live">

                  ● READY

                </div>



              </div>



              <textarea

                value={question}

                onChange={(event) =>

                  setQuestion(event.target.value)

                }

                onKeyDown={handleQuestionKeyDown}

                placeholder="What would you like to know?"

                rows="5"

              />



              <div className="ask-footer">



                <span>

                  Enter to ask · Shift + Enter for a new line

                </span>



                <button

                  className="ask-button"

                  onClick={handleAsk}

                  disabled={!question.trim() || asking}

                >

                  {asking ? (

                    <>

                      <span className="spinner"></span>

                      Thinking...

                    </>

                  ) : (

                    <>

                      Ask AI

                      <span>→</span>

                    </>

                  )}

                </button>



              </div>



            </div>



            {/* ANSWER */}



            {answer && (

              <div className="answer-panel">



                <div className="answer-panel-header">



                  <div className="answer-title">



                    <div className="answer-ai-icon">

                      AI

                    </div>



                    <div>

                      <span>KNOWLEDGEHUB AI</span>

                      <h3>Answer</h3>

                    </div>



                  </div>



                  <button

                    className="clear-button"

                    onClick={() => setAnswer(null)}

                  >

                    Clear

                  </button>



                </div>





<div className="answer-body">

  <ReactMarkdown remarkPlugins={[remarkGfm]}>

    {answer.answer}

  </ReactMarkdown>

</div>



                {answer.sources?.length > 0 && (

                  <div className="sources-section">



                    <div className="sources-heading">



                      <strong>

                        Sources

                      </strong>



                      <span>

                        {answer.sources.length} retrieved

                      </span>



                    </div>



                    <div className="source-grid">



                      {answer.sources.map(

                        (source, index) => (

                          <div

                            className="source-card"

                            key={`${source.chunk_id}-${index}`}

                          >



                            <div className="source-card-top">



                              <span className="source-index">

                                {String(

                                  index + 1

                                ).padStart(2, "0")}

                              </span>



                              <span className="source-distance">

                                {source.distance !==

                                undefined

                                  ? `distance ${Number(

                                      source.distance

                                    ).toFixed(2)}`

                                  : "retrieved"}

                              </span>



                            </div>



                            <strong>

                              {source.document ||

                                source.filename ||

                                source.chunk_id}

                            </strong>



                            <p>

                              {source.text}

                            </p>



                          </div>

                        )

                      )}



                    </div>



                  </div>

                )}



              </div>

            )}



          </section>



          {/* =========================

              DOCUMENTS

          ========================= */}



          <section

            className="section-block"

            id="documents-section"

          >



            <div className="section-title-row">



              <div>



                <span className="section-label">

                  03 · KNOWLEDGE BASE

                </span>



                <h2>

                  Your documents.

                </h2>



              </div>



              <span className="section-note">

                {documentCount} files connected

              </span>



            </div>



            <div className="documents-toolbar">



              <div className="search-box">



                <span>

                  ⌕

                </span>



                <input

                  type="text"

                  value={searchTerm}

                  onChange={(event) =>

                    setSearchTerm(event.target.value)

                  }

                  placeholder="Search your knowledge base..."

                />



              </div>



              <div className="files-count">

                {filteredDocuments.length}

                <small>files</small>

              </div>



            </div>



            {documentsError && (

              <div className="upload-message error">

                {documentsError}

              </div>

            )}



            {loadingDocuments ? (

              <div className="documents-loading">

                <span className="spinner dark"></span>

                Loading knowledge base...

              </div>

            ) : filteredDocuments.length === 0 ? (

              <div className="empty-documents">



                <div className="empty-icon">

                  ▣

                </div>



                <h3>

                  {searchTerm

                    ? "No matching documents"

                    : "Your knowledge base is empty"}

                </h3>



                <p>

                  {searchTerm

                    ? "Try a different document name."

                    : "Upload your first PDF to start building your knowledge base."}

                </p>



              </div>

            ) : (

              <div className="document-grid">



                {filteredDocuments.map(

                  (document) => (

                    <div

                      className="document-card"

                      key={document.id}

                      onClick={() =>

                        setSelectedDocument(document)

                      }

                    >



                      <div className="document-card-top">



                        <div className="pdf-icon">

                          PDF

                        </div>



                        <button

                          className="delete-button"

                          onClick={(event) => {

                            event.stopPropagation();

                            handleDeleteDocument(

                              document.id

                            );

                          }}

                        >

                          Delete

                        </button>



                      </div>



                      <div className="document-main">



                        <h3>

                          {document.filename}

                        </h3>



                        <div className="document-tags">



                          <span>

                            {document.document_type ||

                              "PDF"}

                          </span>



                          <span>

                            {document.chunks || 0} chunks

                          </span>



                        </div>



                      </div>



                      <div className="document-card-bottom">



                        <span>

                          Added{" "}

                          {document.uploaded_at

                            ? new Date(

                                document.uploaded_at

                              ).toLocaleDateString()

                            : "-"}

                        </span>



                        <span className="open-arrow">

                          ↗

                        </span>



                      </div>



                    </div>

                  )

                )}



                {/* ADD DOCUMENT CARD */}



                <div

                  className="add-document-card"

                  onClick={openFilePicker}

                >



                  <div className="add-document-icon">

                    +

                  </div>



                  <strong>

                    Add another document

                  </strong>



                  <span>

                    Expand your knowledge base

                  </span>



                </div>



              </div>

            )}



          </section>



          {/* =========================

              HISTORY

          ========================= */}



          {chatHistory.length > 0 && (

            <section className="section-block history-section">



              <div className="section-title-row">



                <div>



                  <span className="section-label">

                    04 · CONVERSATION

                  </span>



                  <h2>

                    Recent questions.

                  </h2>



                </div>



                <button

                  className="clear-history"

                  onClick={clearChat}

                >

                  Clear history

                </button>



              </div>



              <div className="history-grid">



                {chatHistory.map(

                  (item, index) => (

                    <div

                      className="history-card"

                      key={index}

                    >



                      <div className="history-question">



                        <span className="question-icon">

                          Q

                        </span>



                        <p>

                          {item.question}

                        </p>



                      </div>



                      <div className="history-answer">



                        <span className="history-ai">

                          AI

                        </span>



                        <p>

                          {item.answer}

                        </p>



                      </div>



                    </div>

                  )

                )}



              </div>



            </section>

          )}



          {/* FOOTER */}



          <footer className="footer">



            <span>

              KnowledgeHub AI

            </span>



            <span>

              FastAPI · PostgreSQL · ChromaDB · Ollama

            </span>



          </footer>



        </div>



      </main>



      {/* =========================

          DOCUMENT DETAILS MODAL

      ========================= */}



      {selectedDocument && (

        <div

          className="modal-overlay"

          onClick={() =>

            setSelectedDocument(null)

          }

        >



          <div

            className="document-modal"

            onClick={(event) =>

              event.stopPropagation()

            }

          >



            <button

              className="modal-close"

              onClick={() =>

                setSelectedDocument(null)

              }

            >

              ×

            </button>



            <div className="modal-file-icon">

              PDF

            </div>



            <span className="modal-label">

              DOCUMENT DETAILS

            </span>



            <h2>

              {selectedDocument.filename}

            </h2>



            <p className="modal-description">

              This document is connected to your KnowledgeHub

              knowledge base and available for semantic retrieval.

            </p>



            <div className="modal-stats">



              <div>

                <strong>

                  {selectedDocument.chunks || 0}

                </strong>

                <span>Chunks</span>

              </div>



              <div>

                <strong>

                  PDF

                </strong>

                <span>Format</span>

              </div>



              <div>

                <strong>

                  {selectedDocument.uploaded_at

                    ? new Date(

                        selectedDocument.uploaded_at

                      ).toLocaleDateString()

                    : "-"}

                </strong>

                <span>Added</span>

              </div>



            </div>



            <div className="processing-section">



              <div className="modal-section-title">

                PROCESSING PIPELINE

              </div>



              <div className="processing-step">



                <span>✓</span>



                <div>

                  <strong>Text extraction</strong>

                  <small>

                    Document text extracted

                  </small>

                </div>



              </div>



              <div className="processing-step">



                <span>✓</span>



                <div>

                  <strong>Chunking</strong>



                  <small>

                    {selectedDocument.chunks || 0} chunks created

                  </small>

                </div>



              </div>



              <div className="processing-step">



                <span>✓</span>



                <div>

                  <strong>Embeddings</strong>



                  <small>

                    Semantic vectors generated

                  </small>

                </div>



              </div>



              <div className="processing-step">



                <span>✓</span>



                <div>

                  <strong>Vector storage</strong>



                  <small>

                    Stored in ChromaDB

                  </small>

                </div>



              </div>



            </div>



            <div className="modal-actions">



              <button

                className="modal-ask"

                onClick={() => {

                  setSelectedDocument(null);

                  scrollToSection("ask");

                }}

              >

                Ask about your knowledge

                <span>→</span>

              </button>



              <button

                className="modal-delete"

                onClick={() => {

                  handleDeleteDocument(

                    selectedDocument.id

                  );

                }}

              >

                Delete document

              </button>



            </div>



          </div>



        </div>

      )}



    </div>

  )

);

}



export default App;