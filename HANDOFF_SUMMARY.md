# Zoho Creator Invoice Approval Widget Handoff

## What Has Been Done

### Widget runtime
- Wired the approval action buttons to the real Creator workflow actions.
- Added validation so reject, clarification, and comment actions require a note.
- Kept approve optional with or without a comment.
- Preserved the selected invoice after refresh.
- Added success and error toasts for each action.

### Creator API integration
- Connected the widget to these Creator APIs:
  - `getApprovalInbox`
  - `getApprovalDetail`
  - `approveInvoice`
  - `rejectInvoice`
  - `requestClarification`
  - `addApprovalComment`
- Normalized live Creator response shapes so the UI can read them correctly.
- Added support for both Creator widget runtime mode and standalone public API mode.

### Standalone / Vercel support
- Added a Vercel server-side proxy route at `/api/creator-proxy`.
- The browser now calls the local proxy instead of calling Zoho directly.
- This avoids browser CORS failures on public Creator custom APIs.
- Moved the live Creator custom API URLs into env-driven config so deployment values can be changed without editing widget source.

### Data mapping fixes
- Fixed KPI summary mapping so `NaN` and `undefined` no longer appear.
- Added aliases for live response fields such as summary, detail, line items, approval, and CRM values.
- Improved fallback handling so live data and mock data can both render safely.
- Added clearer empty-value fallbacks for inbox and detail labels so missing backend fields show as explicit placeholders.

### UX resilience
- Added retry actions for inbox and detail fetch failures.
- Kept stale data visible when a refresh fails so the UI degrades more gracefully.

### Build and publish
- Verified production build succeeds.
- Generated a fresh `creator-demo-widget.zip`.
- Committed and pushed the fixes to `main`.

## Current State

- Mock preview still works.
- Live Creator data now works inside Creator.
- Standalone Vercel mode now uses a proxy to reach public Creator APIs.
- The remaining empty fields are likely coming from the backend data itself, not the UI.
- API URLs can now be supplied via `.env` or Vercel environment variables.

## Next Steps

1. Redeploy Vercel from the latest `main` branch.
2. Open the Vercel site and confirm the header shows live/proxy mode instead of mock mode.
3. Check whether any fields are still blank in the inbox or detail panel.
4. If fields are still blank, update the Creator API response or source records for those fields.
5. Add the real public API URLs to Vercel environment variables if they are not already set.
6. If needed, I can also help map any remaining live API field names exactly to the UI.

## Notes

- If `customerName`, `booksStatus`, or `crmAccountName` are blank for some rows, that is usually because the API returns blank values for those records.
- If the page still errors, the fastest next debugging step is to inspect the browser console and the `/api/creator-proxy` response.
