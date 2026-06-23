/**
 * portfolio.ts — the "normal portfolio" page.
 *
 * A professional, document-style alternative to the explorable 3D world. It is
 * rendered entirely from `public/world.json` — the same manifest the engine
 * interprets — so the two views never drift: add a biome (a project/room) plus a
 * hub pad and it appears here automatically, no edits to this file.
 *
 * How the world maps to the page:
 *   - the start biome (`hub`) is the identity/header (name, role, contact links);
 *   - biomes reachable directly from the hub's pads are top-level projects;
 *   - a top-level biome whose own pads lead to *further* biomes is a container
 *     (e.g. the university classroom → academic projects), rendered as a grouped
 *     subsection of child cards.
 * Per-project copy comes from each biome's `board` content (heading/subheading/
 * badge/lines/accent) and its `link` content.
 */
import type { BiomeConfig, ContentConfig, WorldConfig } from '../world/types';
import './portfolio.css';

interface ProjectLink {
  label: string;
  url?: string;
  tooltip?: string;
}

interface Project {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  /** Descriptive bullet lines (tech-stack line pulled out into `tech`). */
  lines: string[];
  /** Tech/tags pulled from a trailing "A · B · C" line, shown as chips. */
  tech: string[];
  accent: string;
  links: ProjectLink[];
  /** Nested projects for container biomes (e.g. academic projects). */
  children: Project[];
}

const DEFAULT_ACCENT = '#7fb4ff';

// ---- world.json → project model -------------------------------------------

function boardOf(biome: BiomeConfig): ContentConfig | undefined {
  return (biome.content ?? []).find((c) => c.type === 'board');
}

function linksOf(biome: BiomeConfig): ProjectLink[] {
  return (biome.content ?? [])
    .filter((c) => c.type === 'link')
    .map((c) => ({ label: c.label ?? 'Link', url: c.url, tooltip: c.tooltip }));
}

/** A trailing "A · B · C" line of short tokens reads as a tech stack — pull it
 *  out so it can render as chips instead of a sentence. Heuristic, but generic:
 *  any biome whose last board line is such a list gets nice tags for free. */
function splitTech(lines: string[]): { lines: string[]; tech: string[] } {
  if (!lines.length) return { lines, tech: [] };
  const last = lines[lines.length - 1];
  const parts = last.split('·').map((s) => s.trim()).filter(Boolean);
  const looksLikeTags = parts.length >= 2 && parts.every((p) => p.split(/\s+/).length <= 4);
  if (looksLikeTags) return { lines: lines.slice(0, -1), tech: parts };
  return { lines, tech: [] };
}

/** Pad targets of a biome, excluding the hub, lift pads, and self. */
function exitsOf(biome: BiomeConfig, hubId: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of biome.pads ?? []) {
    if (p.lift || p.target === hubId || p.target === biome.id) continue;
    if (seen.has(p.target)) continue;
    seen.add(p.target);
    out.push(p.target);
  }
  return out;
}

function toProject(biome: BiomeConfig, children: Project[] = []): Project {
  const board = boardOf(biome);
  const { lines, tech } = splitTech([...(board?.lines ?? [])]);
  return {
    id: biome.id,
    title: board?.heading ?? biome.title,
    subtitle: board?.subheading,
    badge: board?.badge,
    lines,
    tech,
    accent: board?.accent ?? DEFAULT_ACCENT,
    links: linksOf(biome),
    children,
  };
}

interface Model {
  identity: Project;
  /** Standalone top-level projects (no nested rooms). */
  featured: Project[];
  /** Container projects with nested children (e.g. academic group). */
  groups: Project[];
}

function buildModel(world: WorldConfig): Model {
  const byId = new Map<string, BiomeConfig>(world.biomes.map((b) => [b.id, b]));
  const hub = byId.get(world.startBiome);
  if (!hub) throw new Error(`startBiome "${world.startBiome}" not found`);

  const identity = toProject(hub);
  const topIds = exitsOf(hub, hub.id);
  const topSet = new Set(topIds);

  const featured: Project[] = [];
  const groups: Project[] = [];
  for (const id of topIds) {
    const biome = byId.get(id);
    if (!biome) continue;
    // Children = this biome's exits that aren't themselves top-level hub rooms.
    const childIds = exitsOf(biome, hub.id).filter((c) => !topSet.has(c));
    const children = childIds
      .map((c) => byId.get(c))
      .filter((b): b is BiomeConfig => !!b)
      .map((b) => toProject(b));
    const project = toProject(biome, children);
    if (children.length) groups.push(project);
    else featured.push(project);
  }
  return { identity, featured, groups };
}

// ---- rendering -------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Initials for the monogram, from the identity title. */
function monogram(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function linkButton(l: ProjectLink, primary: boolean): string {
  const cls = `lnk${primary ? ' lnk-primary' : ''}`;
  // A link with a tooltip but no URL (e.g. an email) becomes a copy-to-clipboard
  // chip instead of a dead link.
  if (!l.url) {
    const val = l.tooltip ?? l.label;
    return `<button class="${cls} lnk-copy" data-copy="${esc(val)}" title="${esc(val)}">${esc(l.label)}</button>`;
  }
  const ext = /^https?:/.test(l.url);
  const rel = ext ? ' target="_blank" rel="noopener noreferrer"' : '';
  const arrow = ext ? ' <span class="lnk-arrow" aria-hidden="true">↗</span>' : '';
  const tip = l.tooltip ? ` title="${esc(l.tooltip)}"` : '';
  return `<a class="${cls}" href="${esc(l.url)}"${rel}${tip}>${esc(l.label)}${arrow}</a>`;
}

function projectCard(p: Project): string {
  const badge = p.badge ? `<span class="badge">${esc(p.badge)}</span>` : '';
  const sub = p.subtitle ? `<p class="card-sub">${esc(p.subtitle)}</p>` : '';
  const lines = p.lines.length
    ? `<ul class="features">${p.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`
    : '';
  const tech = p.tech.length
    ? `<div class="tags">${p.tech.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>`
    : '';
  const links = p.links.map((l, i) => linkButton(l, i === 0)).join('');
  // Deep-link into the 3D world at this room (read by main.ts on load).
  const open = `<a class="lnk lnk-world" href="/?biome=${encodeURIComponent(p.id)}">Open in 3D <span class="lnk-arrow" aria-hidden="true">↗</span></a>`;
  return `
    <article class="card" style="--accent:${esc(p.accent)}">
      <h3 class="card-title">${esc(p.title)}</h3>
      ${badge}
      ${sub}
      ${lines}
      ${tech}
      <div class="card-links">${links}${open}</div>
    </article>`;
}

function groupSection(g: Project): string {
  const sub = g.subtitle ? `<p class="group-sub">${esc(g.subtitle)}</p>` : '';
  const badge = g.badge ? `<span class="badge">${esc(g.badge)}</span>` : '';
  const cards = g.children.map(projectCard).join('');
  return `
    <div class="group">
      <div class="group-head">
        <h3 class="group-title">${esc(g.title)} ${badge}</h3>
        ${sub}
      </div>
      <div class="grid grid-sub">${cards}</div>
    </div>`;
}

function render(model: Model): string {
  const id = model.identity;
  const heroLines = id.lines.map((l) => `<p class="hero-line">${esc(l)}</p>`).join('');
  const heroLinks = id.links.map((l, i) => linkButton(l, i === 0)).join('');
  const featured = model.featured.map(projectCard).join('');
  const groups = model.groups.map(groupSection).join('');
  const mono = monogram(id.title);
  const year = '2026';

  return `
    <header class="nav">
      <a class="brand" href="#top"><span class="mono-mark">${esc(mono)}</span> ${esc(id.title)}</a>
      <nav class="nav-links">
        <a href="#work">Work</a>
        <a href="#contact">Contact</a>
        <a class="nav-cta" href="/">Enter 3D world <span class="lnk-arrow" aria-hidden="true">→</span></a>
        <button class="theme-toggle" id="theme-toggle" aria-label="Toggle colour theme" title="Toggle theme">
          <span class="theme-icon">◐</span>
        </button>
      </nav>
    </header>

    <section class="hero" id="top">
      <div class="hero-glow" aria-hidden="true"></div>
      <p class="eyebrow reveal">Portfolio</p>
      <h1 class="hero-name reveal">${esc(id.title)}</h1>
      <p class="hero-role reveal">${esc(id.subtitle ?? '')}</p>
      <div class="hero-bio reveal">${heroLines}</div>
      <div class="hero-links reveal">${heroLinks}</div>
    </section>

    <section class="work" id="work">
      <div class="section-head reveal">
        <span class="label">01 — Selected Work</span>
        <h2>Projects</h2>
      </div>
      <div class="grid">${featured}</div>
      ${groups}
    </section>

    <footer class="footer" id="contact">
      <div class="section-head reveal">
        <span class="label">02 — Contact</span>
        <h2>Let's build something.</h2>
      </div>
      <div class="hero-links reveal">${heroLinks}</div>
      <div class="footer-meta">
        <span>© ${year} ${esc(id.title)}</span>
        <a href="/">Prefer to explore? Enter the 3D world →</a>
      </div>
    </footer>`;
}

// ---- behaviour -------------------------------------------------------------

function wireCopyButtons(root: HTMLElement) {
  root.querySelectorAll<HTMLButtonElement>('.lnk-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const val = btn.dataset.copy ?? '';
      try {
        await navigator.clipboard.writeText(val);
      } catch {
        /* clipboard blocked — fall through to the toast anyway */
      }
      const prev = btn.textContent;
      btn.classList.add('copied');
      btn.textContent = 'Copied ✓';
      window.setTimeout(() => {
        btn.classList.remove('copied');
        btn.textContent = prev;
      }, 1400);
    });
  });
}

function wireThemeToggle() {
  const KEY = 'portfolio-theme';
  const root = document.documentElement;
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') root.dataset.theme = saved;
  const btn = document.getElementById('theme-toggle');
  btn?.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    localStorage.setItem(KEY, next);
  });
}

/** Fade/slide elements in as they enter the viewport (skipped if reduced-motion). */
function wireReveal(root: HTMLElement) {
  const items = root.querySelectorAll('.reveal, .card, .group');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.06 },
  );
  items.forEach((el) => io.observe(el));
}

async function main() {
  const page = document.getElementById('page')!;
  try {
    const res = await fetch('/world.json');
    if (!res.ok) throw new Error(`world.json: HTTP ${res.status}`);
    const world = (await res.json()) as WorldConfig;
    const model = buildModel(world);
    page.innerHTML = render(model);
    page.removeAttribute('aria-busy');
    document.title = `${model.identity.title} — ${model.identity.subtitle ?? 'Portfolio'}`;
    wireThemeToggle();
    wireCopyButtons(page);
    wireReveal(page);
  } catch (err) {
    console.error('[portfolio] failed to render:', err);
    page.innerHTML = `<div class="error"><h1>Couldn't load the portfolio.</h1>
      <p>Try the <a href="/">3D experience</a> or <a href="https://github.com/neelaychakravarthy">GitHub</a>.</p></div>`;
    page.removeAttribute('aria-busy');
  }
}

void main();
