/**
 * Mirror of the Uptale player (sncf.uptale.io) that edits the experience model
 * before the player boots, so a plain iframe URL can hide markers/cards and lock a scene.
 *
 * Own query options on /experience/Launch (removed before forwarding upstream):
 *   hideTags=1       remove every marker and card (Topics) in every scene
 *   keepLinks=1      with hideTags: keep navigation markers, drop info cards only
 *   only=<worldId>   keep only that scene and cut all navigation out of it
 *   maxLinks=N       keep at most N navigation markers per scene
 */

const UPSTREAM = "https://sncf.uptale.io";
const OWN = new Set(["hideTags", "keepLinks", "only", "maxLinks"]);
const DROP_RESPONSE_HEADERS = new Set([
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
  "strict-transport-security",
  "content-length",
  "content-encoding",
  "transfer-encoding",
]);

function isLink(tag) {
  const dest = tag && tag.ToDestination;
  return Boolean((dest && dest.Scene) || (tag && tag.ToWorld));
}

function rewriteModel(html, opts) {
  const match = /var modelJSON\s*=\s*(\{[\s\S]*?\});\s*\n/.exec(html);
  if (!match) return { html, note: "modelJSON not found" };
  let model;
  try {
    model = JSON.parse(match[1]);
  } catch (e) {
    return { html, note: "modelJSON parse error" };
  }
  const only = opts.get("only") || "";
  const hide = ["1", "true"].includes(opts.get("hideTags") || "");
  const keepLinks = ["1", "true"].includes(opts.get("keepLinks") || "");
  const maxRaw = opts.get("maxLinks");
  const maxLinks = maxRaw !== null && /^\d+$/.test(maxRaw) ? Number(maxRaw) : null;

  let worlds = Array.isArray(model.Worlds) ? model.Worlds : [];
  if (only) {
    const kept = worlds.filter((w) => w.Id === only);
    worlds = kept.length ? kept : worlds.slice(0, 1);
  }
  for (const world of worlds) {
    let topics = Array.isArray(world.Topics) ? world.Topics : [];
    if (hide) topics = topics.filter((t) => keepLinks && isLink(t));
    if (only) topics = topics.filter((t) => !isLink(t));
    if (maxLinks !== null) {
      let n = 0;
      topics = topics.filter((t) => {
        if (!isLink(t)) return true;
        n += 1;
        return n <= maxLinks;
      });
    }
    world.Topics = topics;
    if (only) world.IsFinal = true;
  }
  model.Worlds = worlds;
  if (only) model.LaunchWithMenu = false;

  const replacement = "var modelJSON = " + JSON.stringify(model) + ";\n";
  return {
    html: html.slice(0, match.index) + replacement + html.slice(match.index + match[0].length),
    note: `ok worlds=${worlds.length} hide=${hide} keepLinks=${keepLinks} only=${only || "-"} maxLinks=${maxLinks ?? "-"}`,
  };
}

function corsPreflight(request) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("tgvm-360 mirror up. Use /experience/Launch?id=...&world=...&hideTags=1", {
        headers: { "content-type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" },
      });
    }
    if (request.method === "OPTIONS") return corsPreflight(request);

    const own = new URLSearchParams();
    const forward = new URLSearchParams();
    for (const [k, v] of url.searchParams) (OWN.has(k) ? own : forward).append(k, v);
    const upstreamUrl = UPSTREAM + url.pathname + (forward.toString() ? "?" + forward.toString() : "");

    const headers = new Headers();
    for (const [k, v] of request.headers) {
      const key = k.toLowerCase();
      if (["host", "origin", "referer", "accept-encoding", "cf-connecting-ip", "cf-ray", "cf-visitor", "x-forwarded-proto", "x-real-ip"].includes(key)) continue;
      if (key.startsWith("cf-")) continue;
      headers.set(k, v);
    }
    headers.set("Referer", UPSTREAM + "/");
    headers.set("Accept-Encoding", "identity");

    const init = { method: request.method, headers, redirect: "manual" };
    if (!["GET", "HEAD"].includes(request.method)) init.body = await request.arrayBuffer();

    let upstream;
    try {
      upstream = await fetch(upstreamUrl, init);
    } catch (e) {
      return new Response("upstream unreachable: " + e.message, { status: 502 });
    }

    const responseHeaders = new Headers();
    for (const [k, v] of upstream.headers) {
      const key = k.toLowerCase();
      if (DROP_RESPONSE_HEADERS.has(key)) continue;
      if (key === "set-cookie") {
        responseHeaders.append("set-cookie", v.replace(/;\s*Domain=[^;]+/i, "").replace(/;\s*Secure/i, "") + "; Secure; SameSite=None");
        continue;
      }
      if (key === "location" && v.startsWith(UPSTREAM)) {
        responseHeaders.set("location", v.slice(UPSTREAM.length));
        continue;
      }
      responseHeaders.set(k, v);
    }
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    const contentType = upstream.headers.get("content-type") || "";
    const isLaunch = url.pathname.toLowerCase().startsWith("/experience/launch") && contentType.includes("text/html");
    if (isLaunch && [...own.keys()].length) {
      const html = await upstream.text();
      const { html: edited, note } = rewriteModel(html, own);
      responseHeaders.set("X-Mirror", note);
      responseHeaders.set("Cache-Control", "no-store");
      return new Response(edited, { status: upstream.status, headers: responseHeaders });
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  },
};
