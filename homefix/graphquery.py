import os
from typing import Annotated,TypedDict
from dotenv import load_dotenv
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder 
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage

from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver

load_dotenv()
api_key = os.getenv("GROQ_API_KEY")

DB_DIR = "./chroma_db"

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
vector_store = Chroma(
    persist_directory=DB_DIR,
    embedding_function=embeddings
)
retriever = vector_store.as_retriever(search_kwargs={"k": 5})

llm = ChatGroq(
    groq_api_key=api_key,
    model_name="openai/gpt-oss-120b",
    temperature=0.2
)


prompt_template = ChatPromptTemplate.from_messages([
    ("system", """You are HomeFix Copilot, an expert AI assistant for appliance repair.
Use ONLY the provided context from the manual to answer the user's questions.
If the context does not contain relevant information, state clearly: "I cannot find information about that in the manual."

Context from Manual:
{context}"""),
    MessagesPlaceholder(variable_name="messages"),
])
class State(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    context: str

# 6. Define Graph Nodes
def retrieve_node(state: State):
    latest_message = state["messages"][-1].content
    docs = retriever.invoke(latest_message)
    context_str = "\n\n".join([f"[Page {d.metadata.get('Page_Number', 'N/A')}]: {d.page_content}" for d in docs])
    return {"context": context_str}

def generate_node(state: State):
    context = state.get("context", "")
    messages = state["messages"]
    
    prompt = prompt_template.invoke({
        "context": context,
        "messages": messages
    })
    
    response = llm.invoke(prompt)
    return {"messages": [response]}

# 7. Build LangGraph Workflow
workflow = StateGraph(State)
workflow.add_node("retrieve", retrieve_node)
workflow.add_node("generate", generate_node)

workflow.add_edge(START, "retrieve")
workflow.add_edge("retrieve", "generate")
workflow.add_edge("generate", END)

# 8. Compile Graph with Memory Checkpointer
checkpointer = MemorySaver()
app = workflow.compile(checkpointer=checkpointer)

# 9. Interactive Loop
def main():
    print("\n HomeFix Copilot Phase 3 (LangGraph Memory) Online!")
    config = {"configurable": {"thread_id": "session_1"}}
    
    while True:
        query = input("\n Ask HomeFix Copilot (or type 'exit' to quit): ")
        if query.lower() == 'exit':
            break
            
        input_state = {"messages": [HumanMessage(content=query)]}
        result = app.invoke(input_state, config=config)
        
        last_message = result["messages"][-1]
        print("\n--- HomeFix Copilot Response ---")
        print(last_message.content)

if __name__ == "__main__":
    main()