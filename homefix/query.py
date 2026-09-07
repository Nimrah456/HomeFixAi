import os
from dotenv import load_dotenv
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate

# 1. Load Groq API Key from .env

load_dotenv()
api_key = os.getenv("GROQ_API_KEY")

DB_DIR = "./chroma_db"

def main():
    # 2. Connect to existing ChromaDB on disk
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    vector_store = Chroma(
        persist_directory=DB_DIR,
        embedding_function=embeddings
    )
    
    # 3. Create Retriever to pull top 3 matching chunks
    retriever = vector_store.as_retriever(search_kwargs={"k": 5})
    
    # 4. Initialize Groq Llama model
    llm = ChatGroq(
        groq_api_key=api_key,
        model_name="openai/gpt-oss-120b",
        temperature=0.2
    )
    
    # 5. Define Grounded System Prompt
    prompt_template = ChatPromptTemplate.from_template("""
    You are HomeFix Copilot, an expert AI assistant for appliance repair.
    Use ONLY the provided context from the manual to answer the user's question.
    If the context does not contain the answer, state clearly: "I cannot find information about that in the manual."

    Context:
    {context}

    Question: {question}

    Answer clearly with concise, step-by-step instructions:
    """)
    
    print("\n HomeFix Copilot Phase 2 Online!")
    
    # 6. Interactive Query Loop
    while True:
        query = input("\n Ask HomeFix Copilot (or type 'exit' to quit): ")
        if query.lower() == 'exit':
            break
            
        # Retrieve context chunks from ChromaDB
        docs = retriever.invoke(query)
        context = "\n\n".join([f"[Page {d.metadata.get('Page_Number', 'N/A')}]: {d.page_content}" for d in docs])
        
        prompt = prompt_template.format(context=context, question=query)
        response = llm.invoke(prompt)
        
        print("\n--- HomeFix Copilot Response ---")
        print(response.content)

if __name__ == "__main__":
    main()