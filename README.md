# Invoice Approval Workspace Widget

Day 45 MVP for a Zoho Creator widget that presents an invoice approval workspace for:

- Zoho Books as the invoice source of truth
- Zoho Creator as the approval workflow owner
- Zoho CRM as future read-only customer and deal context

This version is intentionally mock-first. It does not call Zoho Books or Zoho CRM directly, and it does not require a separate backend.

## Feasibility

Yes, this frontend is feasible inside a Zoho Creator widget.

- The UX is entirely client-side and works with local mock state today.
- The service layer already follows a clean contract that can switch to Creator custom APIs later.
- Creator remains the only server-side system you need for the next step.
- No frontend tokens are required or embedded.

## Delivered structure

```text
index.html
widget.html
css/
  style.css
js/
  config.js
  mockData.js
  invoiceApprovalService.js
  app.js
public/
  manifest.json
```

`index.html` is the build entry used by Vite. `widget.html` mirrors the same UI layout so the requested widget file is present explicitly in the repo.

## Setup instructions

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start local development:

   ```bash
   npm run dev
   ```

3. Open the local Vite URL in the browser. The widget will run in mock mode by default.

4. Build the widget:

   ```bash
   npm run build
   ```

5. Build and package the upload ZIP for Zoho Creator:

   ```bash
   npm run build:widget
   ```

## How to test locally

1. Confirm the header shows `Mock preview mode`.
2. Change the approval status filter and verify the inbox updates.
3. Click different invoices and verify the active selection stays highlighted.
4. Approve an invoice with or without comment.
5. Reject an invoice and confirm a comment is required.
6. Request clarification and confirm a comment is required.
7. Add a comment only and verify comments and audit entries update immediately.
8. Refresh the inbox and confirm the selected invoice remains active when still visible.

## Values to replace later

When you move from mock mode to Creator custom API mode, update these values first:

- `js/config.js`
  - `useMockData`
  - `currentReviewerName`
  - `creator.appLinkName`
  - `creator.reports.*`
  - `creator.forms.*`
  - `creator.customApis.*`
- `public/manifest.json`
  - Widget parameter names for report, form, and function mapping

You can also override many of those values through Zoho Creator widget parameters instead of editing code.

## Switching to Creator custom API mode later

1. Set `useMockData` to `false` in `js/config.js`, or pass widget param `useMockData = false`.
2. Create Creator custom APIs that return and accept the frontend contracts used by `js/invoiceApprovalService.js`.
3. Map the function names in widget parameters or in `js/config.js`:
   - `loadInboxFunctionName`
   - `loadInvoiceDetailFunctionName`
   - `approveInvoiceFunctionName`
   - `rejectInvoiceFunctionName`
   - `requestClarificationFunctionName`
   - `addCommentFunctionName`
4. Make each Creator custom API return the same shapes used in the mock service:
   - `InvoiceInboxItem`
   - `InvoiceDetail`
   - `ApprovalActionPayload`
5. Keep Books and CRM integration behind Creator functions only. The frontend should continue talking only to Creator.

## Notes

- No Zoho Books API calls are implemented in this MVP.
- No Zoho CRM API calls are implemented in this MVP.
- No frontend secrets or tokens are hardcoded.
- The older React-based prototype remains in `src/`, but the active widget entry now uses the plain modular Day 45 structure above.
