import os
import base64
import io
import requests
from typing import List, TypedDict, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from PyPDF2 import PdfReader
from duckduckgo_search import DDGS
from langchain_core.tools import tool

# Initialize FastAPI App
app = FastAPI(title="HomeFix Copilot Backend")

# 1. CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Initialize Groq Client
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
if not GROQ_API_KEY:
    print("Warning: GROQ_API_KEY environment variable is missing.")

groq_client = Groq(api_key=GROQ_API_KEY)


# 3. Helper Functions & Web Scraping Tool
def auto_fetch_manual_from_web(query: str) -> str:
    """Performs DuckDuckGo search and extracts manual contents with low timeout."""
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(f"{query} service manual filetype:pdf", max_results=3))
        
        if not results:
            return "No specific manual found via web search."

        fetched_content = []
        for result in results:
            url = result.get("href", "")
            if url.endswith(".pdf"):
                try:
                    resp = requests.get(url, timeout=3, headers={"User-Agent": "Mozilla/5.0"})
                    if resp.status_code == 200:
                        pdf_file = io.BytesIO(resp.content)
                        reader = PdfReader(pdf_file)
                        extracted = ""
                        for page in reader.pages[:5]:
                            extracted += page.extract_text() or ""
                        if extracted:
                            fetched_content.append(f"Source ({url}):\n{extracted[:1500]}")
                            break
                except Exception:
                    continue
            else:
                fetched_content.append(f"Search Snippet ({url}):\n{result.get('body', '')}")

        return "\n\n".join(fetched_content) if fetched_content else "Could not extract manual content."
    except Exception as e:
        return f"Web manual search encountered an error: {str(e)}"


@tool
def retrieve_manual_context(query: str) -> str:
    """
    Retrieves official technical manual documents and troubleshooting steps.
    IMPORTANT: 'query' MUST explicitly include the exact appliance BRAND (e.g., Samsung, LG, Whirlpool, Bosch), 
    MODEL (if known), and ISSUE to prevent retrieving manuals from wrong manufacturers.
    """
    return auto_fetch_manual_from_web(query)


# 4. Fast Safety Check Node
def evaluate_safety(latest_message: str) -> Optional[str]:
    """Fast regex/keyword safety check bypassing sequential LLM calls."""
    latest_msg_lower = latest_message.lower()
    high_risk_terms = ["electric", "power", "water supply", "voltage", "gas", "capacitor", "wire", "leak", "shock"]
    
    if any(kw in latest_msg_lower for kw in high_risk_terms):
        return " SAFETY MANDATE: Disconnect main utilities (electricity/water/gas) before inspecting or servicing!"
    return None


# 5. Pydantic Models for Endpoints
class ChatRequest(BaseModel):
    message: str
    session_id: str = "default_session"


# 6. API Endpoints

@app.get("/")
def health_check():
    return {"status": "online", "app": "HomeFix Copilot API"}


@app.post("/api/analyze-image")
async def analyze_image_endpoint(
    file: UploadFile = File(...), 
    prompt: str = Form(
        "Analyze this appliance image. Output in this exact format:\n"
        "BRAND: <Detected Brand Name or 'Unknown'>\n"
        "MODEL: <Model Number or 'Unknown'>\n"
        "APPLIANCE TYPE: <e.g., Washing Machine, Refrigerator>\n"
        "VISIBLE ISSUE/SUMMARY: <Brief description of what is visible>"
    )
):
    """Vision Endpoint utilizing qwen/qwen3.6-27b for high-speed multi-modal analysis."""
    try:
        contents = await file.read()
        base64_img = base64.b64encode(contents).decode("utf-8")
        mime_type = file.content_type if file.content_type else "image/jpeg"

        completion = groq_client.chat.completions.create(
            model="qwen/qwen3.6-27b",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{base64_img}"
                            },
                        },
                    ],
                }
            ],
            temperature=0.1,
            max_tokens=250,
        )
        extracted_text = completion.choices[0].message.content
        return {"analysis": extracted_text, "extracted_text": extracted_text}
    except Exception as e:
        print(f"Vision API Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Image analysis error: {str(e)}")


@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    """Primary Chat & RAG Diagnostic Endpoint using openai/gpt-oss-120b."""
    try:
        user_message = request.message
        
        # Fast non-blocking safety check
        safety_warning = evaluate_safety(user_message)

        # Check if manual retrieval is required
        manual_context = ""
        if any(kw in user_message.lower() for kw in ["manual", "error", "code", "fix", "noise", "repair", "symptom"]):
            manual_context = auto_fetch_manual_from_web(user_message)

        # Construct System & User Prompting
        system_instruction = (
            "You are HomeFix Copilot, an expert autonomous appliance repair technician. "
            "Use the provided manual context to give precise, step-by-step diagnostic advice. "
            "Always strictly respect the brand specified in the context. Never quote manuals from wrong manufacturers."
        )

        messages = [
            {"role": "system", "content": system_instruction}
        ]

        if manual_context:
            messages.append({"role": "system", "content": f"RETRIEVED MANUAL CONTEXT:\n{manual_context}"})

        messages.append({"role": "user", "content": user_message})

        completion = groq_client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=messages,
            temperature=0.2,
            max_tokens=800,
        )

        response_text = completion.choices[0].message.content

        return {
            "response": response_text,
            "safety_warning": safety_warning,
            "session_id": request.session_id
        }

    except Exception as e:
        print(f"Chat API Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Chat processing error: {str(e)}")

@app.post("/api/transcribe")
async def transcribe_audio_endpoint(file: UploadFile = File(...)):
    """Audio Endpoint utilizing Whisper for fast voice-to-text transcription."""
    try:
        contents = await file.read()
        filename = file.filename if file.filename else "audio.wav"
        mime_type = file.content_type if file.content_type else "audio/wav"

        transcription = groq_client.audio.transcriptions.create(
            file=(filename, contents, mime_type),
            model="whisper-large-v3-turbo",
            response_format="json",
        )
        return {"text": transcription.text}
    except Exception as e:
        print(f"Transcription API Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Audio transcription error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)