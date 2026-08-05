"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderDocsPage = renderDocsPage;
exports.renderDocsIndex = renderDocsIndex;

const fs = require("fs");
const path = require("path");

const DOCS_DIR = path.join(__dirname, "..");
const DOCS_FILES = [
    { file: "Dokumentasi Proyek AI.md", title: "Dokumentasi Proyek AI", slug: "ai-file-agent" },
    { file: "OPencode-Zen-Setup.md", title: "OpenCode Zen Setup", slug: "opencode-zen" },
    { file: "README.md", title: "README (Proxy API)", slug: "readme" },
    { file: "README.en.md", title: "README English", slug: "readme-en" },
    { file: "AUDIT-DAN-PENYEMPURNAAN.md", title: "Audit & Penyempurnaan", slug: "audit" },
];

const NAV_PAGES = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Dokumentasi", href: "/docs" },
    { label: "OpenCode Zen", href: "/docs/opencode-zen" },
    { label: "Health", href: "/health" },
    { label: "Models", href: "/v1/models" },
    { label: "Logout", href: "/logout" },
];

const PAGE_TITLES = {
    "/docs": "Dokumentasi Proyek AI",
    "/docs/opencode-zen": "OpenCode Zen Setup",
    "/docs/readme": "README",
    "/docs/readme-en": "README English",
    "/docs/audit": "Audit & Penyempurnaan",
    "/dashboard": "Dashboard",
};

function esc(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function inline(text) {
    return text
        .replace(/`([^`]+)`/g, (_, c) => `<code>${esc(c)}</code>`)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, h) => {
            if (h.startsWith("http"))
                return `<a href="${esc(h)}" target="_blank" rel="noopener">${t}</a>`;
            return `<a href="${esc(h)}">${t}</a>`;
        });
}

function convertTable(lines, i) {
    const rows = [];
    while (i < lines.length && lines[i].trim() && lines[i].trim().startsWith("|")) {
        rows.push(lines[i].trim());
        i++;
    }
    if (rows.length < 1)
        return { html: "", next: i };
    const parseRow = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    let html = "<table><thead><tr>";
    const headerCells = parseRow(rows[0]);
    for (const c of headerCells)
        html += `<th>${inline(c)}</th>`;
    html += "</tr></thead><tbody>";
    for (let r = 1; r < rows.length; r++) {
        const cells = parseRow(rows[r]);
        const isSep = cells.every((c) => /^:?-{2,}:?$/.test(c));
        if (isSep)
            continue;
        html += "<tr>";
        for (const c of cells)
            html += `<td>${inline(c)}</td>`;
        html += "</tr>";
    }
    html += "</tbody></table>";
    return { html, next: i };
}

function convertMarkdown(md) {
    const lines = md.replace(/\r\n/g, "\n").split("\n");
    let html = "";
    let i = 0;
    let inCode = false;
    let codeBuf = [];
    let codeLang = "";
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        if (inCode) {
            if (trimmed.startsWith("```")) {
                html += `<pre><code class="lang-${esc(codeLang)}">${esc(codeBuf.join("\n"))}</code></pre>`;
                codeBuf = [];
                inCode = false;
                codeLang = "";
            }
            else {
                codeBuf.push(line);
            }
            i++;
            continue;
        }
        if (trimmed.startsWith("```")) {
            inCode = true;
            codeLang = trimmed.slice(3).trim();
            i++;
            continue;
        }
        if (trimmed.startsWith("### ")) {
            html += `<h3>${inline(trimmed.slice(4))}</h3>`;
            i++;
            continue;
        }
        if (trimmed.startsWith("## ")) {
            const title = trimmed.slice(3).trim();
            const anchor = title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");
            html += `<h2 id="${esc(anchor)}">${inline(title)}</h2>`;
            i++;
            continue;
        }
        if (trimmed.startsWith("# ")) {
            html += `<h1>${inline(trimmed.slice(2))}</h1>`;
            i++;
            continue;
        }
        if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
            html += "<hr>";
            i++;
            continue;
        }
        if (trimmed.startsWith("|")) {
            const { html: tbl, next } = convertTable(lines, i);
            html += tbl;
            i = next;
            continue;
        }
        if (trimmed.startsWith("- [ ] ") || trimmed.startsWith("- [x] ")) {
            const checked = trimmed.startsWith("- [x]");
            const text = trimmed.replace(/^- \[.\] /, "");
            html += `<li class="checkbox ${checked ? "done" : ""}"><span class="box">${checked ? "&#9745;" : "&#9744;"}</span> ${inline(text)}</li>`;
            i++;
            while (i < lines.length && lines[i].trim().startsWith("- [") === false && lines[i].trim() && !lines[i].trim().startsWith("###") && !lines[i].trim().startsWith("##") && !lines[i].trim().startsWith("---")) {
                i++;
            }
            continue;
        }
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("+ ")) {
            const items = [];
            while (i < lines.length) {
                const t = lines[i].trim();
                if (t.startsWith("- ") || t.startsWith("* ") || t.startsWith("+ "))
                    items.push(`<li>${inline(t.slice(2))}</li>`);
                else if (t.startsWith("  - "))
                    items.push(`<li class="nested">${inline(t.slice(4))}</li>`);
                else
                    break;
                i++;
            }
            html += `<ul>${items.join("")}</ul>`;
            continue;
        }
        if (/^\d+\.\s/.test(trimmed)) {
            const items = [];
            while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
                items.push(`<li>${inline(lines[i].trim().replace(/^\d+\.\s/, ""))}</li>`);
                i++;
            }
            html += `<ol>${items.join("")}</ol>`;
            continue;
        }
        if (trimmed.startsWith("> ")) {
            const quotes = [];
            while (i < lines.length && lines[i].trim().startsWith("> ")) {
                quotes.push(inline(lines[i].trim().slice(2)));
                i++;
            }
            html += `<blockquote>${quotes.join("<br>")}</blockquote>`;
            continue;
        }
        if (trimmed === "") {
            i++;
            continue;
        }
        // Paragraph
        const para = [];
        while (i < lines.length && lines[i].trim() !== "" && !lines[i].trim().startsWith("```") && !lines[i].trim().startsWith("|") && !lines[i].trim().startsWith("## ") && !lines[i].trim().startsWith("### ") && !lines[i].trim().startsWith("---") && !lines[i].trim().startsWith("- ") && !lines[i].trim().startsWith("* ") && !/^\d+\.\s/.test(lines[i].trim()) && !lines[i].trim().startsWith("> ")) {
            para.push(lines[i]);
            i++;
        }
        html += `<p>${inline(para.join(" ").trim())}</p>`;
    }
    if (inCode) {
        html += `<pre><code class="lang-${esc(codeLang)}">${esc(codeBuf.join("\n"))}</code></pre>`;
    }
    return html;
}

function readDocFile(slug) {
    const meta = DOCS_FILES.find((d) => d.slug === slug);
    if (!meta)
        return null;
    const p = path.join(DOCS_DIR, meta.file);
    if (!fs.existsSync(p))
        return null;
    return fs.readFileSync(p, "utf8");
}

function navBar(activePath) {
    const items = NAV_PAGES.map((p) => {
        const active = activePath === p.href || (activePath.startsWith("/docs") && p.href === "/docs");
        return `<a class="nav-item ${active ? "active" : ""}" href="${p.href}">${p.label}</a>`;
    }).join("");
    return `<nav class="topnav"><div class="brand">OpenCode <span>Zen</span> Gateway</div><div class="nav-links">${items}</div></nav>`;
}

function pageShell(title, activePath, bodyHtml) {
    return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - OpenCode Zen Gateway</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0d1117; --card: #161b22; --border: #30363d; --border2: #21262d;
    --fg: #c9d1d9; --muted: #8b949e; --accent: #58a6ff; --green: #3fb950;
    --yellow: #d29922; --red: #da3633; --blue: #1f6feb; --purple: #a371f7;
  }
  * { box-sizing: border-box; }
  body { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--bg); color: var(--fg); margin: 0; padding: 0; }
  .topnav { position: sticky; top: 0; z-index: 100; display: flex; flex-wrap: wrap; align-items: center; gap: 14px; background: #0d1117cc; backdrop-filter: blur(8px); border-bottom: 1px solid var(--border); padding: 10px 20px; }
  .brand { font-size: 14px; font-weight: 700; color: var(--fg); white-space: nowrap; }
  .brand span { color: var(--accent); }
  .nav-links { display: flex; flex-wrap: wrap; gap: 6px; }
  .nav-item { font-size: 12px; color: var(--muted); text-decoration: none; border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; transition: all .15s; }
  .nav-item:hover { color: var(--accent); border-color: var(--accent); }
  .nav-item.active { color: #fff; background: var(--blue); border-color: var(--blue); }
  .wrap { max-width: 960px; margin: 0 auto; padding: 24px 20px 60px; }
  .page-head { margin-bottom: 18px; }
  .page-head h1 { font-size: 22px; color: var(--accent); margin: 0 0 4px; }
  .page-head .sub { color: var(--muted); font-size: 12px; }
  .doc-body h1 { font-size: 22px; color: var(--accent); border-bottom: 1px solid var(--border); padding-bottom: 8px; margin: 8px 0 14px; }
  .doc-body h2 { font-size: 16px; color: var(--fg); border-bottom: 1px solid var(--border2); padding-bottom: 6px; margin: 26px 0 10px; }
  .doc-body h3 { font-size: 13px; color: var(--accent); margin: 18px 0 8px; }
  .doc-body p { font-size: 13px; line-height: 1.6; margin: 8px 0; }
  .doc-body ul, .doc-body ol { font-size: 13px; line-height: 1.7; padding-left: 22px; margin: 8px 0; }
  .doc-body li.nested { list-style: none; margin-left: 14px; color: var(--muted); }
  .doc-body li.checkbox { list-style: none; margin-left: -18px; }
  .doc-body li.checkbox .box { color: var(--accent); }
  .doc-body li.checkbox.done .box { color: var(--green); }
  .doc-body code { background: var(--border2); border: 1px solid var(--border); border-radius: 4px; padding: 1px 5px; font-size: 12px; color: var(--purple); }
  .doc-body pre { background: #0a0e14; border: 1px solid var(--border); border-radius: 8px; padding: 14px; overflow-x: auto; margin: 10px 0; }
  .doc-body pre code { background: none; border: 0; padding: 0; color: var(--green); font-size: 12px; line-height: 1.5; }
  .doc-body table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 12px 0; }
  .doc-body th, .doc-body td { text-align: left; padding: 7px 10px; border: 1px solid var(--border2); }
  .doc-body th { background: var(--card); color: var(--accent); }
  .doc-body blockquote { border-left: 3px solid var(--accent); background: var(--card); border-radius: 0 6px 6px 0; margin: 10px 0; padding: 10px 14px; color: var(--muted); font-size: 12px; }
  .doc-body hr { border: 0; border-top: 1px solid var(--border); margin: 22px 0; }
  .doc-body a { color: var(--accent); }
  .doc-body strong { color: var(--fg); }
  .toc { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 14px 18px; margin-bottom: 20px; }
  .toc h2 { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin: 0 0 8px; border: 0; padding: 0; }
  .toc ul { list-style: none; padding: 0; margin: 0; }
  .toc li { padding: 2px 0; }
  .toc a { color: var(--muted); text-decoration: none; font-size: 12px; }
  .toc a:hover { color: var(--accent); }
  .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .doc-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px 18px; text-decoration: none; display: block; transition: all .15s; }
  .doc-card:hover { border-color: var(--accent); transform: translateY(-2px); }
  .doc-card .c-title { font-size: 14px; font-weight: 600; color: var(--accent); margin: 0 0 6px; }
  .doc-card .c-desc { font-size: 12px; color: var(--muted); line-height: 1.5; margin: 0; }
  .empty { color: var(--muted); font-size: 13px; }
  @media (max-width: 700px) { .topnav { flex-direction: column; align-items: flex-start; } .nav-links { width: 100%; } }
</style>
</head>
<body>
${navBar(activePath)}
<div class="wrap">
${bodyHtml}
</div>
</body>
</html>`;
}

function buildToc(md) {
    const lines = md.replace(/\r\n/g, "\n").split("\n");
    const items = [];
    for (const line of lines) {
        const t = line.trim();
        if (t.startsWith("## ")) {
            const title = t.slice(3).trim();
            const anchor = title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");
            items.push(`<li><a href="#${esc(anchor)}">${inline(title)}</a></li>`);
        }
    }
    if (items.length === 0)
        return "";
    return `<div class="toc"><h2>Daftar Isi</h2><ul>${items.join("")}</ul></div>`;
}

function renderDocsIndex() {
    const cards = DOCS_FILES.map((d) => {
        const desc = {
            "Dokumentasi Proyek AI.md": "Blueprint lengkap AI File Agent: arsitektur, tech stack, fitur, API, keamanan, dan roadmap.",
            "OPencode-Zen-Setup.md": "Panduan setup OpenCode Zen: key pool, model, konfigurasi, dan troubleshooting.",
            "README.md": "Dokumentasi opencode-api proxy: instalasi, penggunaan, dan endpoint API.",
            "README.en.md": "English version of the opencode-api proxy documentation.",
            "AUDIT-DAN-PENYEMPURNAAN.md": "Catatan audit, perbaikan, dan penyempurnaan sistem gateway.",
        }[d.file] || "Dokumentasi proyek.";
        return `<a class="doc-card" href="/docs/${esc(d.slug)}">
          <p class="c-title">${esc(d.title)}</p>
          <p class="c-desc">${esc(desc)}</p>
        </a>`;
    }).join("");
    const body = `<div class="page-head"><h1>Dokumentasi Proyek</h1><p class="sub">Pilih dokumentasi untuk dibaca</p></div>
      <div class="card-grid">${cards}</div>`;
    return pageShell("Dokumentasi", "/docs", body);
}

function renderDocsPage(activePath, slug) {
    const md = readDocFile(slug);
    if (md === null)
        return null;
    const meta = DOCS_FILES.find((d) => d.slug === slug);
    const title = meta ? meta.title : "Dokumentasi";
    const body = `<div class="page-head"><h1>${esc(title)}</h1><p class="sub">${new Date().toLocaleString("id-ID")}</p></div>
      ${buildToc(md)}
      <div class="doc-body">${convertMarkdown(md)}</div>`;
    return pageShell(title, activePath, body);
}
