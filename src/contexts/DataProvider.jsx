import { useEffect, useMemo, useState } from "react";
import { DataContext } from "./DataContext";
import { createCreatorApi } from "../services/creatorApi";

const CREATOR_SDK_URL =
  "https://static.zohocdn.com/creator/widgets/version/2.0/widgetsdk-min.js";

function getZohoCreatorSdk() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.ZOHO?.CREATOR ?? null;
}

function loadCreatorSdk() {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  const existingSdk = getZohoCreatorSdk();

  if (existingSdk) {
    return Promise.resolve(existingSdk);
  }

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(
      'script[data-zoho-creator-sdk="true"], script[src*="creator/widgets/version/2.0/widgetsdk-min.js"]',
    );

    if (existingScript) {
      const handleResolve = () => resolve(getZohoCreatorSdk());

      if (getZohoCreatorSdk()) {
        handleResolve();
        return;
      }

      existingScript.addEventListener("load", handleResolve);
      existingScript.addEventListener("error", () => {
        reject(new Error("Failed to load the Zoho Creator SDK script."));
      });
      return;
    }

    const script = document.createElement("script");
    script.src = CREATOR_SDK_URL;
    script.async = false;
    script.dataset.zohoCreatorSdk = "true";
    script.onload = () => resolve(getZohoCreatorSdk());
    script.onerror = () => {
      reject(new Error("Failed to load the Zoho Creator SDK script."));
    };
    document.head.appendChild(script);
  });
}

export function DataProvider({ children }) {
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState("");
  const [initData, setInitData] = useState(null);
  const [initParams, setInitParams] = useState(null);
  const [widgetParams, setWidgetParams] = useState({});
  const [creator, setCreator] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      let sdk = null;

      try {
        sdk = await loadCreatorSdk();
      } catch (error) {
        if (mounted) {
          setInitError(
            error instanceof Error
              ? error.message
              : "Failed to load the Zoho Creator SDK script.",
          );
          setInitLoading(false);
        }
        return;
      }

      if (!sdk) {
        if (mounted) {
          setInitError(
            "Zoho Creator SDK was not found. Load this widget inside Zoho Creator or verify the SDK script tag in index.html.",
          );
          setInitLoading(false);
        }
        return;
      }

      try {
        let data = null;

        if (typeof sdk.init === "function") {
          data = await sdk.init();
        }

        if (!mounted) {
          return;
        }

        let nextInitParams = null;
        let nextWidgetParams = {};

        try {
          if (typeof sdk.UTIL?.getInitParams === "function") {
            nextInitParams = await sdk.UTIL.getInitParams();
          }
        } catch (error) {
          console.warn("Failed to load Creator init params.", error);
        }

        try {
          if (typeof sdk.UTIL?.getWidgetParams === "function") {
            nextWidgetParams = sdk.UTIL.getWidgetParams() ?? {};
          }
        } catch (error) {
          console.warn("Failed to load Creator widget params.", error);
        }

        console.log("Widget SDK initialized successfully.");
        setCreator(sdk);
        setInitData(data ?? null);
        setInitParams(nextInitParams);
        setWidgetParams(nextWidgetParams);
      } catch (error) {
        if (!mounted) {
          return;
        }

        setInitError(
          error instanceof Error
            ? error.message
            : "Failed to initialize the Zoho Creator SDK.",
        );
      } finally {
        if (mounted) {
          setInitLoading(false);
        }
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, []);

  const api = useMemo(() => createCreatorApi(creator), [creator]);

  const value = useMemo(
    () => ({
      ZOHO: typeof window !== "undefined" ? window.ZOHO ?? null : null,
      api,
      creator,
      initData,
      initParams,
      initError,
      initLoading,
      isReady: Boolean(creator) && !initLoading && !initError,
      widgetParams,
    }),
    [api, creator, initData, initParams, initError, initLoading, widgetParams],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
