import os
import pdfplumber
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

PDF_PATH = "sample_manual.pdf"
DB_DIR = "./chroma_db"

def load_and_chunk_pdf(pdf_path):           
    documents = []
    print(f"Opening the Resource: {pdf_path}")
    with pdfplumber.open(pdf_path) as pdf:
        for page_number, page in enumerate(pdf.pages, start = 1):
            text = page.extract_text()
            if text:
                documents.append({
                    "text" : text,
                    "metadata":{
                    "Page_Number" : page_number,
                    "Resource" : pdf_path
                    }
                })
    print(f"Extracted {len(documents)} pages")
    return documents            

def chunk_documents(documents):
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size = 1000,
        chunk_overlap = 200,
        separators = ["\n\n","\n", " ",""]
    )
    chunks = []
    metadatas = []
    for doc in documents:
        page_chunks = text_splitter.split_text(doc["text"])
        for chunk in page_chunks:
            chunks.append(chunk)
            metadatas.append(doc["metadata"])
    print(f"Total Number of Chunks is {len(chunks)}")  
    return chunks,metadatas     

def  store_in_chroma(chunks, metadatas):
    print("Now we will try to convert text to vectors and save it to chromadb")
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    vector_store = Chroma.from_texts(
        texts = chunks,
        embedding = embeddings,
        metadatas = metadatas,
        persist_directory = DB_DIR
    )
    print(f"Vector database is created in {DB_DIR}")

if __name__ == "__main__":
    if os.path.exists(PDF_PATH):
        raw_docs = load_and_chunk_pdf(PDF_PATH)
        chunks, metadatas = chunk_documents(raw_docs)
        store_in_chroma(chunks, metadatas)
    else:
        print(f" Error: no PDF WAS FOUND '{PDF_PATH}'.")










