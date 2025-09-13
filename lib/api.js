// Lightweight API client with centralized error handling and no data fabrication.
// All endpoints are relative to window.AppConfig.API_BASE_URL.

(function () {
  if (!window.AppConfig) {
    console.error("AppConfig is required. Make sure to include lib/config.js first.");
  }

  const base = () => (window.AppConfig && window.AppConfig.API_BASE_URL) || "/api";

  async function request(path, options = {}) {
    const url = `${base()}${path}`;
    const headers = Object.assign(
      { "Content-Type": "application/json" },
      options.headers || {}
    );
    const fetchOptions = Object.assign({}, options, { headers });
    const res = await fetch(url, fetchOptions);
    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const err = await res.json();
        if (err && err.message) message = err.message;
      } catch (e) {}
      const error = new Error(message);
      error.status = res.status;
      error.url = url;
      throw error;
    }
    if (res.status === 204) return null;
    try {
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  // Auth & profile
  const me = {
    get: () => request("/me", { method: "GET" }),
    logout: () => request("/auth/logout", { method: "POST" }),
  };

  // Sessions & scheduling
  const sessions = {
    next: () => request(`/sessions/next`, { method: "GET" }),
    today: () => request(`/sessions?range=today`, { method: "GET" }),
    list: (params = "") => request(`/sessions${params ? `?${params}` : ""}`, { method: "GET" }),
    create: (payload) => request("/sessions", { method: "POST", body: JSON.stringify(payload) }),
    details: (id) => request(`/sessions/${id}`, { method: "GET" }),
    end: (id, payload) => request(`/sessions/${id}/end`, { method: "POST", body: JSON.stringify(payload) }),
  };

  // Students
  const students = {
    list: (query = {}) => {
      const params = new URLSearchParams(query).toString();
      return request(`/students${params ? `?${params}` : ""}`, { method: "GET" });
    },
    details: (id) => request(`/students/${id}`, { method: "GET" }),
    create: (payload) => request("/students", { method: "POST", body: JSON.stringify(payload) }),
    available: (q = "") => request(`/students/available${q ? `?q=${encodeURIComponent(q)}` : ""}`, { method: "GET" }),
    assign: (studentId, payload = {}) => request(`/students/${studentId}/assign`, { method: "POST", body: JSON.stringify(payload) }),
  };

  // Homework
  const homework = {
    list: (status) => request(`/homework${status ? `?status=${encodeURIComponent(status)}` : ""}`, { method: "GET" }),
    assign: (payload) => request("/homework", { method: "POST", body: JSON.stringify(payload) }),
    gradeBulk: (payload) => request("/homework/grade-bulk", { method: "POST", body: JSON.stringify(payload) }),
  };

  // Messages
  const messages = {
    conversations: (q = "") => request(`/messages/conversations${q ? `?q=${encodeURIComponent(q)}` : ""}`, { method: "GET" }),
    thread: (id) => request(`/messages/conversations/${id}`, { method: "GET" }),
    send: (id, payload) => request(`/messages/conversations/${id}/messages`, { method: "POST", body: JSON.stringify(payload) }),
    start: (payload) => request(`/messages/conversations`, { method: "POST", body: JSON.stringify(payload) }),
  };

  // Resources
  const resources = {
    list: () => request(`/resources`, { method: "GET" }),
    upload: async (file, meta = {}) => {
      const form = new FormData();
      form.append("file", file);
      Object.entries(meta).forEach(([k, v]) => form.append(k, v));
      const url = `${base()}/resources`;
      const res = await fetch(url, { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
  };

  // Earnings
  const earnings = {
    overview: () => request(`/earnings/overview`, { method: "GET" }),
    transactions: () => request(`/earnings/transactions`, { method: "GET" }),
    exportCSV: () => request(`/earnings/export`, { method: "GET" }),
  };

  // Notifications
  const notifications = {
    list: () => request(`/notifications`, { method: "GET" }),
  };

  // Invites
  const invites = {
    createStudentInvite: () => request(`/invites/student`, { method: "POST" }),
  };

  // Profile
  const profile = {
    me: () => request(`/profile/me`, { method: "GET" }),
    update: (payload) => request(`/profile/me`, { method: "PUT", body: JSON.stringify(payload) }),
    uploadAvatar: async (file) => {
      const form = new FormData();
      // API contract: multipart/form-data with field name "file"
      form.append("file", file);
      const url = `${base()}/profile/avatar`;
      const res = await fetch(url, { method: "POST", body: form });
      if (!res.ok) {
        const err = new Error(`Request failed (${res.status})`);
        err.status = res.status; throw err;
      }
      const out = await res.json();
      try { window.dispatchEvent(new CustomEvent('avatar:updated', { detail: out })); } catch (e) {}
      return out;
    },
    updateNotifications: (payload) => request(`/profile/notifications`, { method: "PUT", body: JSON.stringify(payload) }),
    changePassword: (payload) => request(`/profile/password`, { method: "POST", body: JSON.stringify(payload) }),
    uploadCredential: async (file, meta = {}) => {
      const form = new FormData();
      form.append("file", file);
      Object.entries(meta).forEach(([k,v]) => form.append(k, v));
      const url = `${base()}/profile/credentials`;
      const res = await fetch(url, { method: "POST", body: form });
      if (!res.ok) { const err = new Error(`Request failed (${res.status})`); err.status = res.status; throw err; }
      return res.json();
    },
    deleteCredential: (id) => request(`/profile/credentials/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };

  window.API = {
    me,
    sessions,
    students,
    homework,
    messages,
    resources,
    earnings,
    notifications,
    invites,
    profile,
  };
})();


