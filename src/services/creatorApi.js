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

async function callSdkMethod(creator, path, payload, operationName) {
  assertReady(creator, operationName);

  const method = resolveSdkMethod(creator, path);

  if (typeof method !== "function") {
    throw new Error(
      `${operationName} is not available on the current Zoho Creator SDK object. Update src/services/creatorApi.js to match the APIs exposed in your Creator environment.`,
    );
  }

  return method(payload);
}

export function createCreatorApi(creator) {
  return {
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
