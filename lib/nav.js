// /lib/nav.js
function toFile(path){
  const map = {
    "/": "index.html",
    "/signin": "signin.html",
    "/dashboard": "dashboard.html",
    "/profile": "profile.html",
    "/admin": "admin.html",
    "/messages": "messages.html",
    "/dashboard-tutor": "pages/tutor-dashboard.html",
  };
  const file = map[path] || map["/"];

  // build a URL relative to the SITE ROOT, not the current file's directory
  // document.baseURI respects <base href="/"> set in pages, falling back to origin
  const rootBase = (typeof document !== 'undefined' && document.baseURI)
    ? document.baseURI
    : (location.origin + '/');
  return new URL(file, rootBase).href;
}

export function go(path){ location.assign(toFile(path)); }
export function replace(path){ location.replace(toFile(path)); }
