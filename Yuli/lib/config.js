// App configuration. Update these to point to your backend.
// No third-party services are required or used.

window.AppConfig = {
  // Base URL for REST API calls, e.g., "https://api.yourdomain.com"
  API_BASE_URL: "/api",

  // Base URL for WebSocket connections, e.g., "wss://api.yourdomain.com"
  WS_BASE_URL: (location.protocol === "https:" ? "wss://" : "ws://") + location.host,

  // Feature flags for easy backend swaps
  features: {
    realtimeMessaging: true,
    whiteboardExport: true,
    screenShare: true,
  },
};


