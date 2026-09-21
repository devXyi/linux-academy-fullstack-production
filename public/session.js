(() => {
  const ACCESS_KEY = "la_token";
  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  // Access JWTs live only in memory. The persistent credential is an
  // HttpOnly refresh cookie and therefore cannot be read by page JavaScript.
  Storage.prototype.getItem = function (key) {
    if (key === ACCESS_KEY) return null;
    return originalGetItem.call(this, key);
  };
  Storage.prototype.setItem = function (key, value) {
    if (key === ACCESS_KEY) return;
    return originalSetItem.call(this, key, value);
  };
  Storage.prototype.removeItem = function (key) {
    if (key === ACCESS_KEY) return;
    return originalRemoveItem.call(this, key);
  };

  let refreshing = null;

  async function refresh() {
    if (!refreshing) {
      refreshing = fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" }
      }).then(async (response) => {
        if (!response.ok) throw new Error("Session expired");
        return response.json();
      }).finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const requestInit = { ...init, credentials: init.credentials || "include" };
    let response = await nativeFetch(input, requestInit);

    const isAuthEndpoint = /\/api\/auth\/(login|register|refresh|logout)(?:[/?]|$)/.test(url);
    if (response.status !== 401 || isAuthEndpoint || requestInit._sessionRetried) return response;

    try {
      const session = await refresh();
      const headers = new Headers(requestInit.headers || (input instanceof Request ? input.headers : undefined));
      headers.set("Authorization", `Bearer ${session.token}`);
      response = await nativeFetch(input, { ...requestInit, headers, _sessionRetried: true });
    } catch {
      // Let the original 401 reach app.js, which clears its in-memory user state.
    }
    return response;
  };
})();
