# Creator Demo Widget

A starter Zoho Creator widget built with Vite, React, Tailwind CSS, and DaisyUI.

## What is included

- Promise-based `ZOHO.CREATOR.init()` initialization in a shared provider
- Centralized Creator API wrapper in `src/services/creatorApi.js`
- Demo CRUD UI for loading report records and creating, updating, and deleting via the documented JS API v2 methods
- Widget parameter support via `manifest.json` and `ZOHO.CREATOR.UTIL.getWidgetParams()`
- A context/debug panel for inspecting initialization data, widget params, and form metadata

## Project structure

```text
src/
  main.jsx
  App.jsx
  App.css
  index.css
  contexts/
    DataContext.jsx
    DataProvider.jsx
  services/
    creatorApi.js
  components/
    LoadingSpinner.jsx
    RecordsList.jsx
    RecordForm.jsx
public/
  manifest.json
```

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the dev server:

   ```bash
   npm run dev
   ```

3. Build the widget for deployment:

   ```bash
   npm run build
   ```

4. Build and package a ready-to-upload Zoho widget ZIP:

   ```bash
   npm run build:widget
   ```

   This creates `creator-demo-widget.zip` in the project root from the latest `dist/` output.

## Zoho Creator integration notes

- The Zoho Creator SDK script is loaded in `index.html`.
- The app waits for `ZOHO.CREATOR.init()` before any API call is attempted.
- `public/manifest.json` is copied into the build output and defines Creator widget configuration for `appName`, `formName`, and `reportName`.
- At runtime, the app reads `ZOHO.CREATOR.UTIL.getWidgetParams()` and uses those mapped values as defaults before falling back to session/init context or manual input.
- The current wrapper matches the documented JS API v2 surface:
  - `ZOHO.CREATOR.DATA.getRecords`, `getRecordById`, `addRecords`, `updateRecordById`, `deleteRecordById`
  - `ZOHO.CREATOR.META.getFields`, `getForms`
- JS API v2 uses `report_name` for record fetch/update/delete tasks and `form_name` for create and field metadata tasks, so the demo exposes both inputs.
- For Zoho Creator internal widget hosting, code changes still require re-uploading the widget package. Use `npm run build:widget` to regenerate a fresh uploadable ZIP quickly.
- The built widget assets will be generated in `dist/` and can be packaged for upload to Zoho Creator.
