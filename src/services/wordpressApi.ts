/**
 * wordpressApi.ts — Mobile app
 *
 * Fetches articles from somosanalistas.com WordPress (headless CMS)
 * and normalizes them to the app's NewsArticle type.
 *
 * CORS: the WP REST API already returns Access-Control-Allow-Origin headers.
 */

import type { NewsArticle } from '../data/types';

const WP_BASE = 'https://somosanalistas.com/wp-json/wp/v2';

// ── Raw WP types ─────────────────────────────────────────────────────────────

interface WPEmbedMedia {
  source_url: string;
  media_details?: { sizes?: { large?: { source_url: string }; medium_large?: { source_url: string } } };
}

interface WPEmbedTerm {
  id: number;
  name: string;
  taxonomy: string;
}

interface WPEmbedAuthor {
  name: string;
}

interface WPRawPost {
  id: number;
  date: string;
  slug: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  content: { rendered: string };
  _embedded?: {
    'wp:featuredmedia'?: WPEmbedMedia[];
    'wp:term'?: WPEmbedTerm[][];
    author?: WPEmbedAuthor[];
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip HTML tags and decode common entities */
function stripHtml(html: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&#039;': "'", '&nbsp;': ' ', '&ndash;': '–', '&mdash;': '—',
    '&laquo;': '«', '&raquo;': '»', '&#8230;': '…', '&hellip;': '…',
  };
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&[^;]+;/g, m => entities[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convert WordPress HTML content to plain text with paragraph breaks.
 * Preserves \n\n between paragraphs so NewsDetailScreen can split them.
 */
function htmlToPlainText(html: string): string {
  return html
    // Block-level elements → paragraph break
    .replace(/<\/(p|div|h[1-6]|blockquote|li)>/gi, '\n\n')
    // Line breaks
    .replace(/<br\s*\/?>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&#8230;/g, '…')
    .replace(/&hellip;/g, '…')
    .replace(/&[^;]+;/g, '')
    // Clean up excessive blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Relative time label in Spanish */
function timeLabel(isoDate: string): { label: string; minutesAgo: number } {
  const diffMin = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60_000);
  let label: string;
  if (diffMin < 1)        label = 'Ahora mismo';
  else if (diffMin < 60)  label = `Hace ${diffMin}m`;
  else {
    const h = Math.floor(diffMin / 60);
    if (h < 24)           label = `Hace ${h}h`;
    else {
      const d = Math.floor(h / 24);
      if (d === 1)        label = 'Ayer';
      else if (d < 7)     label = `Hace ${d} días`;
      else                label = `Hace ${Math.floor(d / 7)} sem`;
    }
  }
  return { label, minutesAgo: diffMin };
}

/** Pick best image URL from WP media embed */
function pickImage(media?: WPEmbedMedia): string {
  if (!media) return '';
  const sizes = media.media_details?.sizes;
  return sizes?.large?.source_url ?? sizes?.medium_large?.source_url ?? media.source_url ?? '';
}

/** Normalize a raw WP post → NewsArticle */
function normalize(raw: WPRawPost): NewsArticle {
  const cats = (raw._embedded?.['wp:term']?.flat() ?? [])
    .filter(t => t.taxonomy === 'category')
    .map(t => t.name);

  const { label, minutesAgo } = timeLabel(raw.date);
  const image = pickImage(raw._embedded?.['wp:featuredmedia']?.[0]);
  const author = raw._embedded?.author?.[0]?.name ?? 'Analistas';
  const category = cats[0] ?? 'Fútbol';
  const plainContent = htmlToPlainText(raw.content.rendered);

  return {
    id:       String(raw.id),
    title:    stripHtml(raw.title.rendered),
    summary:  stripHtml(raw.excerpt.rendered).slice(0, 200),
    content:  plainContent,
    image,
    source:   author,
    time:     label,
    category,
    timeAgo:  minutesAgo,
    // All WP articles appear in all sections (no personalization yet)
    sections: ['para-ti', 'siguiendo', 'ultimas'],
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch latest N articles from WordPress.
 * Returns empty array on error so the app gracefully falls back.
 */
export async function getWPNews(count = 20): Promise<NewsArticle[]> {
  try {
    const params = new URLSearchParams({
      _embed:   '1',
      per_page: String(count),
      orderby:  'date',
      order:    'desc',
      status:   'publish',
    });
    const res = await fetch(`${WP_BASE}/posts?${params}`);
    if (!res.ok) throw new Error(`WP ${res.status}`);
    const raw: WPRawPost[] = await res.json();
    return raw.map(normalize);
  } catch (err) {
    console.warn('[wordpressApi] fetch failed:', err);
    return [];
  }
}

/**
 * Fetch a single article by WordPress post ID.
 */
export async function getWPNewsById(id: string): Promise<NewsArticle | null> {
  try {
    const res = await fetch(`${WP_BASE}/posts/${id}?_embed=1`);
    if (!res.ok) return null;
    const raw: WPRawPost = await res.json();
    return normalize(raw);
  } catch {
    return null;
  }
}
