/**
 * Lightweight HTML → Markdown converter for agent content negotiation.
 * Handles common HTML elements without external dependencies.
 */

/** Strip all HTML tags, decode common entities, and collapse whitespace */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/** Convert an HTML string to Markdown */
export function htmlToMarkdown(html: string): string {
  let md = html;

  // Remove <script>, <style>, <noscript>, <svg>, <head> blocks entirely
  md = md.replace(/<(script|style|noscript|svg|head)\b[^>]*>[\s\S]*?<\/\1>/gi, '');

  // Headings
  md = md.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, content) => {
    return '\n' + '#'.repeat(Number(level)) + ' ' + stripTags(content).trim() + '\n';
  });

  // Paragraphs
  md = md.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_, content) => {
    const text = stripTags(content).trim();
    return text ? '\n' + text + '\n' : '';
  });

  // Line breaks
  md = md.replace(/<br\s*\/?>/gi, '\n');

  // Bold
  md = md.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, c) => `**${stripTags(c).trim()}**`);

  // Italic
  md = md.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, c) => `*${stripTags(c).trim()}*`);

  // Inline code
  md = md.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, c) => `\`${stripTags(c).trim()}\``);

  // Code blocks (pre > code)
  md = md.replace(/<pre\b[^>]*>\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, c) => {
    return '\n```\n' + stripTags(c).trim() + '\n```\n';
  });

  // Pre blocks
  md = md.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, c) => {
    return '\n```\n' + stripTags(c).trim() + '\n```\n';
  });

  // Blockquotes
  md = md.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, c) => {
    return '\n' + stripTags(c).trim().split('\n').map((l: string) => `> ${l}`).join('\n') + '\n';
  });

  // Anchors
  md = md.replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const label = stripTags(text).trim();
    return label ? `[${label}](${href})` : '';
  });

  // Images
  md = md.replace(/<img\b[^>]*src=["']([^"']*)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gi, (_, src, alt) => `![${alt}](${src})`);
  md = md.replace(/<img\b[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']*)["'][^>]*\/?>/gi, (_, alt, src) => `![${alt}](${src})`);
  md = md.replace(/<img\b[^>]*src=["']([^"']*)["'][^>]*\/?>/gi, (_, src) => `![](${src})`);

  // Unordered lists
  md = md.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_, content) => {
    return '\n' + content.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_: string, li: string) => {
      return '- ' + stripTags(li).trim() + '\n';
    }) + '\n';
  });

  // Ordered lists
  md = md.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_, content) => {
    let i = 0;
    return '\n' + content.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_: string, li: string) => {
      return `${++i}. ${stripTags(li).trim()}\n`;
    }) + '\n';
  });

  // Horizontal rules
  md = md.replace(/<hr\b[^>]*\/?>/gi, '\n---\n');

  // Strip remaining tags
  md = stripTags(md);

  // Collapse excessive blank lines
  md = md.replace(/\n{3,}/g, '\n\n').trim();

  return md + '\n';
}

/** Rough token count estimation (~4 chars per token, matching Cloudflare's approach) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Check if a request prefers text/markdown via Accept header */
export function prefersMarkdown(req: Request): boolean {
  const accept = req.headers.get('accept') || '';
  return accept.includes('text/markdown');
}
