# ⚡️ Agentic Power Platform Template

Welcome to the ultimate Pro-Dev, AI-Assisted environment for Microsoft Power Platform. 

This repository is designed to facilitate a flawless pair-programming experience between you (the Human Architect) and your local AI Agent.

---

## 🧠 The Core Philosophy: "The Shell & Inject" Workflow
Microsoft enforces strict security rules: local code cannot forge OAuth connection tokens (like Outlook or Dataverse connections). Attempting to build an entire architecture via headless browser automation (Playwright) is brittle and easily broken by UI updates.

Therefore, the most powerful and efficient way to build is the **Shell & Inject Workflow**. 
You act as the Architect who authenticates the connections; the AI acts as the Engineer who writes the heavy code.

### How it Works (The 5-Step Agentic Cycle)

**Step 1: The Blueprint**
Tell your AI Agent what you want to achieve in plain English. The AI will generate a local architectural design document, outlining exactly which Dataverse tables and Flow triggers to use.

**Step 2: The Shell (Human Action)**
Go to `make.powerapps.com`. 
1. Create the blank Dataverse Tables.
2. Create an Automated Flow and simply **drop the raw, empty nodes** onto the canvas (e.g., an HTTP Trigger and a Dataverse "Add a row" action).
3. **Leave all the fields and JSON boxes completely blank.** Just connect the nodes and hit Save. This forces Microsoft to generate the secure "ID Badges" (Connection References).

**Step 3: The Handover**
Return to VS Code and tell your AI: *"The shell is ready."*

**Step 4: The Injection (AI Action)**
The AI takes over autonomously:
1. It uses the `pac` CLI to download your empty shell from the cloud.
2. It rips open the raw `.json` and `.xml` files.
3. It injects complex JSON schemas, mathematical expressions, `if()` statements, data parsing loops, and error-handling directly into the code.
4. It packs the code and deploys the finished engine back to the cloud.

**Step 5: Autonomous Testing**
The AI writes custom PowerShell or Node.js scripts locally to fire API payloads (like fake invoices or telemetry data) directly at your newly built cloud flow, validating that the logic works perfectly without you ever needing to click a button.

---

## 🛠️ Repository Structure
* `/Solutions/` - Contains the version-controlled, unpacked source code of your cloud apps and flows.
* `/Scripts/` - Contains automation scripts for testing APIs and executing Application Lifecycle Management (ALM).
* `/Environment-Report.md` - The technical audit of this local machine's capabilities.

*Happy Automating!*
