const normalizeBase = (value: string) => value.replace(/\/+$/, "");

const deriveWebsocketBase = (httpBase: string) => {
  try {
    const url = new URL(httpBase);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  } catch (_) {
    if (httpBase.startsWith("https://")) {
      return `wss://${httpBase.slice("https://".length)}`;
    }
    if (httpBase.startsWith("http://")) {
      return `ws://${httpBase.slice("http://".length)}`;
    }
    return httpBase;
  }
};

const fallbackApiBase = "http://localhost:8000";
const apiBaseRaw = import.meta.env.VITE_API_BASE_URL ?? fallbackApiBase;
const apiBaseUrl = normalizeBase(apiBaseRaw);
const wsBaseRaw = import.meta.env.VITE_WS_BASE_URL ?? deriveWebsocketBase(apiBaseUrl);
const wsBaseUrl = normalizeBase(wsBaseRaw);

export const envConfig = {
  apiBaseUrl,
  wsBaseUrl,
  buildApiPath: (path: string) => `${apiBaseUrl}/${path.replace(/^\//, "")}`,
  buildWsPath: (path: string) => `${wsBaseUrl}/${path.replace(/^\//, "")}`,
};
