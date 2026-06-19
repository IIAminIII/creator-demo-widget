function assertReady(creator, operationName) {
  if (!creator) {
    throw new Error(
      `${operationName} is unavailable before ZOHO.CREATOR.init() finishes.`,
    );
  }
}

function resolveSdkMethod(creator, path) {
  return path.reduce((currentValue, key) => currentValue?.[key], creator);
}

function getNestedMessage(value) {
  if (!value || typeof value !== "object") {
    return "";
  }

  const candidates = [
    value.message,
    value.error,
    value.details,
    value.description,
    value.response?.message,
    value.response?.error,
    value.responseText,
    value.data?.message,
    value.data?.error,
    value.result?.message,
    value.result?.error,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

function formatSdkError(error, operationName) {
  if (error instanceof Error && error.message.trim()) {
    return `${operationName} failed: ${error.message}`;
  }

  const nestedMessage = getNestedMessage(error);

  if (nestedMessage) {
    return `${operationName} failed: ${nestedMessage}`;
  }

  if (typeof error === "string" && error.trim()) {
    return `${operationName} failed: ${error.trim()}`;
  }

  try {
    return `${operationName} failed: ${JSON.stringify(error)}`;
  } catch {
    return `${operationName} failed.`;
  }
}

async function callSdkMethod(creator, path, payload, operationName) {
  assertReady(creator, operationName);

  const method = resolveSdkMethod(creator, path);

  if (typeof method !== "function") {
    throw new Error(
      `${operationName} is not available on the current Zoho Creator SDK object. Update src/services/creatorApi.js to match the APIs exposed in your Creator environment.`,
    );
  }

  try {
    return await method(payload);
  } catch (error) {
    throw new Error(formatSdkError(error, operationName));
  }
}

export function createCreatorApi(creator) {
  return {
    async invokeFunction(functionName, payload = {}) {
      const candidates = [
        { path: ["FUNCTIONS", "execute"], args: { name: functionName, payload } },
        { path: ["UTIL", "executeFunction"], args: { name: functionName, payload } },
        { path: ["executeFunction"], args: { name: functionName, payload } },
      ];

      for (const candidate of candidates) {
        const method = resolveSdkMethod(creator, candidate.path);

        if (typeof method === "function") {
          return callSdkMethod(
            creator,
            candidate.path,
            candidate.args,
            `invokeFunction(${functionName})`,
          );
        }
      }

      throw new Error(
        `invokeFunction(${functionName}) is not available on the current Zoho Creator SDK object. Extend src/services/creatorApi.js to match your Creator function execution API.`,
      );
    },

    async getRecords(reportName, { appName, criteria, fieldConfig, fields } = {}) {
      return callSdkMethod(
        creator,
        ["DATA", "getRecords"],
        {
          app_name: appName,
          report_name: reportName,
          criteria,
          field_config: fieldConfig,
          fields,
        },
        "getRecords",
      );
    },

    async getRecord(reportName, recordId, { appName, fieldConfig, fields } = {}) {
      return callSdkMethod(
        creator,
        ["DATA", "getRecordById"],
        {
          app_name: appName,
          report_name: reportName,
          id: recordId,
          field_config: fieldConfig,
          fields,
        },
        "getRecord",
      );
    },

    async addRecord(formName, data, { appName, skipWorkflow } = {}) {
      return callSdkMethod(
        creator,
        ["DATA", "addRecords"],
        {
          app_name: appName,
          form_name: formName,
          payload: {
            data,
            ...(skipWorkflow ? { skip_workflow: skipWorkflow } : {}),
          },
        },
        "addRecord",
      );
    },

    async updateRecord(reportName, recordId, data, { appName, skipWorkflow } = {}) {
      return callSdkMethod(
        creator,
        ["DATA", "updateRecordById"],
        {
          app_name: appName,
          report_name: reportName,
          id: recordId,
          payload: {
            data,
            ...(skipWorkflow ? { skip_workflow: skipWorkflow } : {}),
          },
        },
        "updateRecord",
      );
    },

    async deleteRecord(reportName, recordId, { appName, skipWorkflow } = {}) {
      return callSdkMethod(
        creator,
        ["DATA", "deleteRecordById"],
        {
          app_name: appName,
          report_name: reportName,
          id: recordId,
          payload: skipWorkflow ? { skip_workflow: skipWorkflow } : {},
        },
        "deleteRecord",
      );
    },

    async getFormFields(formName, { appName } = {}) {
      return callSdkMethod(
        creator,
        ["META", "getFields"],
        {
          app_name: appName,
          form_name: formName,
        },
        "getFormFields",
      );
    },

    async getFormMetadata(formName, { appName } = {}) {
      const response = await callSdkMethod(
        creator,
        ["META", "getForms"],
        { app_name: appName },
        "getFormMetadata",
      );

      if (!formName) {
        return response;
      }

      const forms = Array.isArray(response?.forms) ? response.forms : [];
      return forms.find((form) => form.link_name === formName) ?? null;
    },
  };
}
