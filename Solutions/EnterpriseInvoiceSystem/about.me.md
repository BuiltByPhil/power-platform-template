# Enterprise Invoice System

## About This System
This is a Pro-Dev, API-driven solution for processing incoming invoices. It bypasses the need for unreliable email scraping by providing a secure HTTP Webhook. External systems (like vendor ERPs or AI OCR scanners) can POST JSON data directly to this endpoint, and the system instantly saves the record into a Dataverse database.

## Architecture
1. **Dataverse Table (`aura_invoice`)**: The core database table holding invoice records.
2. **Power Automate Flow (`Process HTTP Invoice`)**: The engine that catches the HTTP request, parses the JSON, and writes to the database.
3. **PowerShell Test Script (`Test-Invoice.ps1`)**: A local automation script used to simulate a vendor sending data.

## Why this architecture?
* **License Efficient**: Bypasses the need for Premium AI Builder or Office 365 Exchange licenses.
* **Speed & Reliability**: HTTP requests are processed in milliseconds and do not get caught in spam filters.
* **Agentic Automation**: Because it uses an API, this system can be 100% autonomously tested by AI agents without UI clicks.

---

## Deployment & Setup Guide

Since this is a brand-new database architecture, we must establish the schema in the cloud first before we can pack and deploy custom local logic. 

### Step 1: Scaffold the Database (Browser)
1. Go to [make.powerapps.com](https://make.powerapps.com).
2. Create a Solution named **EnterpriseInvoiceSystem**.
3. Create a **Table** named `Invoice`. 
4. Add two columns: `Total Amount` (Currency) and `Vendor Name` (Text).

### Step 2: Create the Engine (Browser)
1. In that same solution, create a new **Automated Cloud Flow**.
2. **Trigger**: Search for `When an HTTP request is received`. 
    * In the "Request Body JSON Schema" box, copy and paste the schema found in lines 13-23 of the `Process-Invoice-Flow.json` file in this repository.
3. **Action**: Search for Dataverse `Add a new row`.
    * Select your new `Invoices` table. 
    * Map the dynamic content from the HTTP trigger to your columns.
4. **Save the flow**. When you save, Microsoft will generate your **Secret HTTP URL** in the trigger block. Copy that URL.

### Step 3: Agentic Testing (Local Terminal)
Now that the engine is built, we test it autonomously!
1. Open your terminal in this workspace.
2. Run the testing script and paste your Secret URL when prompted:
   ```bash
   pwsh ./Scripts/Test-Invoice.ps1 -WebhookUrl "PASTE_YOUR_URL_HERE"
   ```
3. Watch the terminal output. It will instantly shoot a fake invoice at your Flow.
4. Go to your Dataverse table in the browser—you will see the new invoice magically appear!

## Ongoing Maintenance
If you ever need to add complex validation (e.g., checking if the vendor exists before saving), simply tell me (your AI Agent). I will pull the flow down using `pac solution clone`, inject the complex code locally, and push the updated engine back to the cloud.
