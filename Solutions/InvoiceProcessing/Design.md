# Architecture Blueprint: Invoice Processing System

This document outlines the components required for the Automated Invoice Processing System.

## 1. Dataverse Structure
You need to create a custom table in Dataverse to store the extracted data.

*   **Table Name**: `Invoice` (Plural: `Invoices`)
*   **Primary Column**: `Invoice Number` (Single Line of Text)
*   **Custom Columns**:
    *   `Total Amount` (Currency)
    *   `Sender Email` (Single Line of Text)
    *   `Received Date` (Date and Time)
    *   `Status` (Choice: `New`, `Processing`, `Completed`, `Failed`) - *Default to 'New'*
    *   `Confidence Score` (Decimal Number) - *Optional: to track AI extraction accuracy*

## 2. Power Automate Flow: "Process Incoming Invoices"
Create an automated cloud flow with the following steps:

### Trigger: Office 365 Outlook
*   **Action**: `When a new email arrives (V3)`
*   **Configuration**:
    *   Folder: `Inbox`
    *   Include Attachments: `Yes`
    *   Only with Attachments: `Yes`
    *   Subject Filter: (Optional, e.g., "Invoice")

### Step 1: Iterate through Attachments
*   **Action**: `Apply to each`
*   **Input**: `@triggerOutputs()?['body/attachments']` *(Select 'Attachments' from dynamic content)*

### Step 2: Extract Data (Inside the loop)
*   **Action**: AI Builder -> `Extract information from invoices`
*   **Configuration**:
    *   Invoice file: `Attachment Content` (from dynamic content)

### Step 3: Save to Dataverse (Inside the loop)
*   **Action**: Microsoft Dataverse -> `Add a new row`
*   **Configuration**:
    *   Table name: `Invoices`
    *   **Invoice Number**: `Invoice ID (value)` (from AI Builder)
    *   **Total Amount**: `Invoice total (value)` (from AI Builder)
    *   **Sender Email**: `From` (from the Email trigger dynamic content)
    *   **Received Date**: `Received Time` (from the Email trigger dynamic content)

## 3. Next Steps (Action Required)
1.  Go to [make.powerapps.com](https://make.powerapps.com).
2.  Ensure you are in the correct Dev environment.
3.  Create a new Solution named **InvoiceProcessing** (Publisher: AuraSystems, Prefix: aura) to match our local scaffold.
4.  Build the Dataverse Table and Flow as outlined above inside that solution.
5.  Once done, let me know, and we will sync the cloud solution down to this local machine for version control!
