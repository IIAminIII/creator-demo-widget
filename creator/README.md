# Creator-side Implementation Guide

This frontend widget is designed to run in two modes:

- `mock` mode for local development and visual validation
- `creator` mode when the required Creator forms, reports, and function contracts are configured

## Forms

### `Invoice_Approval_Requests`

Create the following fields in Zoho Creator:

- `Books_Invoice_ID`
- `Books_Invoice_Number`
- `Books_Customer_ID`
- `Books_Customer_Name`
- `CRM_Account_ID`
- `CRM_Account_Name`
- `CRM_Deal_ID`
- `CRM_Deal_Name`
- `CRM_Owner_Name`
- `Invoice_Total`
- `Currency_Code`
- `Invoice_Date`
- `Due_Date`
- `Books_Invoice_Status`
- `Books_Payment_Status`
- `Approval_Status`
- `Assigned_Reviewer`
- `Priority`
- `Exception_Reason`
- `Reviewer_Notes`
- `Approval_Decision_Date`
- `Last_Books_Sync_At`
- `Last_CRM_Enrichment_At`

### `Invoice_Approval_Comments`

- `Approval_Request_ID`
- `Author`
- `Comment_Type`
- `Comment_Body`
- `Created_At`

### `Invoice_Approval_Audit_Log`

- `Approval_Request_ID`
- `Event_Type`
- `Event_Summary`
- `Actor`
- `Created_At`

## Reports

- `Pending_Invoice_Approvals`
- `Invoice_Approval_Comments_Report`
- `Invoice_Approval_Audit_Log_Report`
- optional additional filtered reports such as:
  - `Rejected_or_Needs_Clarification`
  - `Recently_Approved_Invoices`

## Widget params

Configure these widget params in `public/manifest.json`:

- `creatorAppName`
- `approvalRequestsFormName`
- `approvalRequestsReportName`
- `commentsFormName`
- `commentsReportName`
- `auditLogFormName`
- `auditLogReportName`
- `booksListFunctionName`
- `booksDetailFunctionName`
- `crmContextFunctionName`
- `approvalActionFunctionName`
- `inboxDefaultStatusFilter`

## Function contracts

The frontend expects Creator-side functions to normalize Books and CRM responses into stable app-level JSON.

Required function names:

- `listBooksInvoicesForApproval`
- `getBooksInvoiceDetails`
- `getCrmContextForInvoice`
- `approveInvoice`
- `rejectInvoice`
- `requestClarification`
- `addApprovalComment`

Minimum payload shapes are documented in `creator/function-contracts.json`.

## Runtime expectations

- Books is the source of truth for invoice facts
- Creator is the source of truth for workflow state, comments, and audit
- CRM provides read-only context in v1
- Creator-side functions should never return raw Books or CRM payloads directly to the widget
