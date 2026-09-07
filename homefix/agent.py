import os
from typing import Annotated, TypedDict, Literal
from dotenv import load_dotenv

from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage
from langchain_core.tools import tool

from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import ToolNode

# 1. Environment Setup
load_dotenv()
api_key = os.getenv("GROQ_API_KEY")
DB_DIR = "./chroma_db"

# 2. Vector DB & Retriever Initialization
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
vector_store = Chroma(
    persist_directory=DB_DIR,
    embedding_function=embeddings
)
retriever = vector_store.as_retriever(search_kwargs={"k": 5})

# 3. Define the Retrieval Tool
@tool
def retrieve_manual_context(query: str) -> str:
    """
    Search and retrieve specific instructions, safety rules, installation guidelines, 
    and specifications from the appliance manual.
    Use this whenever a user asks a technical or repair question about the appliance.
    """
    docs = retriever.invoke(query)
    if not docs:
        return "No relevant information found in the manual."
    return "\n\n".join([f"[Page {d.metadata.get('Page_Number', 'N/A')}]: {d.page_content}" for d in docs])

tools = [retrieve_manual_context]
tool_node = ToolNode(tools)

# 4. Initialize LLM bound with Tools
llm = ChatGroq(
    groq_api_key=api_key,
    model_name="openai/gpt-oss-120b",
    temperature=0.1
)
llm_with_tools = llm.bind_tools(tools)

# 5. System Prompt
system_prompt = """You are HomeFix Copilot, an expert AI assistant for appliance repair.
You have access to a tool named `retrieve_manual_context` to look up information from the manufacturer's manual.

Rules:
1. ALWAYS use `retrieve_manual_context` to look up technical details, specs, setup steps, or safety guidelines.
2. If the user greeting is generic (e.g. "Hello", "Who are you?"), respond directly without calling the tool.
3. Base your answers strictly on the manual context retrieved.
4. If the tool returns no relevant details, state: "I cannot find information about that in the manual."
"""

prompt_template = ChatPromptTemplate.from_messages([
    ("system", system_prompt),
    MessagesPlaceholder(variable_name="messages"),
])

# 6. Graph State
class State(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    safety_warning: str

# 7. Nodes & Safety Routing
HIGH_RISK_KEYWORDS = ["electric", "power", "plug", "socket", "water supply", "tap", "leak", "mains", "voltage", "wire"]

def safety_check_node(state: State):
    """Inspects the latest user query for electrical/water hazard keywords."""
    latest_msg = state["messages"][-1].content.lower()
    warning = ""
    for kw in HIGH_RISK_KEYWORDS:
        if kw in latest_msg:
            warning = " SAFETY MANDATE: Ensure the appliance is completely disconnected from the power supply and water mains before performing any maintenance!"
            break
    return {"safety_warning": warning}

def agent_node(state: State):
    """Executes the agent decision block."""
    messages = state["messages"]
    prompt = prompt_template.invoke({"messages": messages})
    response = llm_with_tools.invoke(prompt)
    return {"messages": [response]}

def should_continue(state: State) -> Literal["tools", END]:
    """Conditional router determining if the agent requested a tool call."""
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"
    return END

# 8. Build LangGraph Workflow
workflow = StateGraph(State)

workflow.add_node("safety_check", safety_check_node)
workflow.add_node("agent", agent_node)
workflow.add_node("tools", tool_node)

workflow.add_edge(START, "safety_check")
workflow.add_edge("safety_check", "agent")

workflow.add_conditional_edges(
    "agent",
    should_continue,
    {
        "tools": "tools",
        END: END
    }
)
workflow.add_edge("tools", "agent")

checkpointer = MemorySaver()
app = workflow.compile(checkpointer=checkpointer)

# 9. Interactive CLI
def main():
    print("\n HomeFix Copilot Phase 4 (Agentic AI & Safety Intercept) Online!")
    config = {"configurable": {"thread_id": "agent_session_1"}}
    
    while True:
        query = input("\n🔧 Ask HomeFix Copilot (or type 'exit' to quit): ")
        if query.lower() == 'exit':
            break
            
        input_state = {"messages": [HumanMessage(content=query)], "safety_warning": ""}
        result = app.invoke(input_state, config=config)
        
        # Check safety warning from latest state
        safety_warn = result.get("safety_warning", "")
        last_message = result["messages"][-1]
        
        print("\n--- HomeFix Copilot Response ---")
        if safety_warn:
            print(f"\n{safety_warn}\n")
        print(last_message.content)

if __name__ == "__main__":
    main()