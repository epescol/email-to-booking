import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "p", "br", "hr", "div", "span",
  "b", "strong", "i", "em", "u", "s", "small", "sub", "sup",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "a", "ul", "ol", "li", "blockquote",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th",
  "img", "figure", "figcaption",
];

const ALLOWED_ATTR = [
  "href", "target", "rel",
  "src", "alt", "title", "width", "height",
  "style", "class", "align",
  "colspan", "rowspan", "cellpadding", "cellspacing", "border",
];

/**
 * Sanitize untrusted HTML before injecting via dangerouslySetInnerHTML.
 * Strips <script>, <iframe>, event handlers, javascript: URIs, etc.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "style"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus"],
  });
}
