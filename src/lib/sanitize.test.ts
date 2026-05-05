import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "./sanitize";

describe("sanitizeHtml — XSS prevention", () => {
  it("returns empty string for null/undefined/empty", () => {
    expect(sanitizeHtml(null)).toBe("");
    expect(sanitizeHtml(undefined)).toBe("");
    expect(sanitizeHtml("")).toBe("");
  });

  it("strips <script> tags", () => {
    const out = sanitizeHtml('<p>hi</p><script>alert("xss")</script>');
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/alert/);
    expect(out).toContain("<p>hi</p>");
  });

  it("strips <iframe> tags", () => {
    const out = sanitizeHtml('<iframe src="https://evil.com"></iframe><p>ok</p>');
    expect(out).not.toMatch(/<iframe/i);
    expect(out).toContain("<p>ok</p>");
  });

  it("strips inline event handlers (onerror, onclick, onload, onmouseover)", () => {
    const payloads = [
      '<img src=x onerror="alert(1)">',
      '<a href="#" onclick="alert(1)">click</a>',
      '<body onload="alert(1)">x</body>',
      '<div onmouseover="alert(1)">x</div>',
    ];
    for (const p of payloads) {
      const out = sanitizeHtml(p);
      expect(out).not.toMatch(/on(error|click|load|mouseover|focus)\s*=/i);
      expect(out).not.toMatch(/alert/);
    }
  });

  it("strips javascript: URIs in href", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toMatch(/javascript:/i);
  });

  it("strips <object>, <embed>, <form>, <input>, <button>", () => {
    const payloads = [
      '<object data="evil.swf"></object>',
      '<embed src="evil.swf">',
      '<form action="/steal"><input name="x"><button>go</button></form>',
    ];
    for (const p of payloads) {
      const out = sanitizeHtml(p);
      expect(out).not.toMatch(/<(object|embed|form|input|button)/i);
    }
  });

  it("strips <style> tags (CSS-based exfil/expression attacks)", () => {
    const out = sanitizeHtml('<style>body{background:url("javascript:alert(1)")}</style><p>ok</p>');
    expect(out).not.toMatch(/<style/i);
    expect(out).toContain("<p>ok</p>");
  });

  it("preserves safe formatting tags and attributes", () => {
    const safe = '<p>Hello <strong>world</strong></p><a href="https://example.com" target="_blank" rel="noopener">link</a>';
    const out = sanitizeHtml(safe);
    expect(out).toContain("<strong>world</strong>");
    expect(out).toMatch(/href="https:\/\/example\.com"/);
  });

  it("preserves tables (used by email templates)", () => {
    const html = "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>";
    const out = sanitizeHtml(html);
    expect(out).toContain("<table>");
    expect(out).toContain("<td>1</td>");
  });

  it("strips data-* attributes (ALLOW_DATA_ATTR=false)", () => {
    const out = sanitizeHtml('<p data-evil="x">hi</p>');
    expect(out).not.toMatch(/data-evil/);
  });

  it("neutralises mixed/obfuscated XSS payloads", () => {
    const payloads = [
      '<svg/onload=alert(1)>',
      '<img src=1 href=1 onerror="javascript:alert(1)"></img>',
      '<a href="JaVaScRiPt:alert(1)">x</a>',
      '"><script>alert(1)</script>',
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    ];
    for (const p of payloads) {
      const out = sanitizeHtml(p);
      expect(out).not.toMatch(/alert\s*\(/i);
      expect(out).not.toMatch(/<script/i);
      expect(out).not.toMatch(/javascript:/i);
      expect(out).not.toMatch(/<iframe/i);
    }
  });
});
