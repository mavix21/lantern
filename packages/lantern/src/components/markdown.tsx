import * as React from 'react';
import { Text, useStdout } from 'ink';
import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import type { Tokens } from 'marked';
import chalk from 'chalk';
import {
	useTerminalImages,
	imageProtocol,
	type ImageRef,
	type CachedImage,
} from '../hooks/use-terminal-images.js';

type Props = {
	children: string;
	searchQuery?: string;
	activeMatchIndex?: number | null;
	paddingX?: number;
	paddingY?: number;
	basePath?: string;
};

const ext = markedTerminal({
	firstHeading: (text: string) => chalk.magentaBright.bold.inverse(` ${text} `),
	heading: (text: string) => chalk.green.bold.inverse(` ${text} `),
	strong: chalk.magenta.bold,
	codespan: chalk.bgBlack.whiteBright,
	tab: 2,
});

// ── Background helpers ───────────────────────────────────────────────
// Very dark background (ANSI 256-color 234 = #1c1c1c) for code blocks
// and blockquotes so they stand out as distinct regions.
const BG_OPEN = '\u001b[48;5;234m';
const BG_CLOSE = '\u001b[49m';
const BG_MARKER = '\x00BG\x00';

// eslint-disable-next-line no-control-regex -- intentional: match ANSI SGR sequences
const ANSI_RE = /\u001b\[[0-9;]*m/g;

function visibleLength(str: string): number {
	return str.replace(ANSI_RE, '').length;
}

// Apply a dark background to `line`, padding it with spaces so the
// background extends to `width`. Re-applies the BG code after every
// SGR-reset (\u001b[0m) and after every BG-reset (\u001b[49m) so that
// syntax-highlighting and nested blockquotes can't clear the background.
function bgLine(line: string, width: number): string {
	const pad = Math.max(0, width - visibleLength(line));
	const padded = line + ' '.repeat(pad);
	return (
		BG_OPEN +
		padded
			.replaceAll('\u001b[0m', '\u001b[0m' + BG_OPEN)
			.replaceAll(BG_CLOSE, BG_CLOSE + BG_OPEN) +
		BG_CLOSE
	);
}

// ── Renderer overrides ──────────────────────────────────────────────
// Fix: marked-terminal's text renderer uses `token.text` (the raw string)
// instead of parsing inline tokens, so bold, codespan, etc. inside tight
// list items are never styled. Override it to call parseInline when tokens
// are available.
const origText = ext.renderer!.text!;
ext.renderer!.text = function (token: Tokens.Text | Tokens.Escape) {
	if ('tokens' in token && token.tokens && token.tokens.length > 0) {
		return this.parser.parseInline(token.tokens);
	}
	return origText.call(this, token);
};

// Fix: in marked v17, list item tokens include a `checkbox` token that the
// parser renders via the extension. But marked-terminal's listitem() also
// prepends a checkbox by calling r.checkbox() directly on the prototype,
// causing duplication. Neutralise the extension-level checkbox renderer so
// only the manual one from listitem() survives.
ext.renderer!.checkbox = function () {
	return '';
};

// ── Image support ────────────────────────────────────────────────────
// The image renderer emits a unique marker during parsing. A later step
// replaces each marker with either a real terminal-rendered image (once
// loaded asynchronously) or a styled placeholder while loading.
const IMG_MARKER_PREFIX = '\x00IMG:';
const IMG_MARKER_SUFFIX = '\x00';
const IMG_MARKER_RE = /\x00IMG:(\d+)\x00/g;
let imageRefs: ImageRef[] = [];

ext.renderer!.image = function (token: Tokens.Image) {
	const idx = imageRefs.length;
	imageRefs.push({
		href: token.href || '',
		alt: token.text || 'image',
		title: token.title,
	});
	return `${IMG_MARKER_PREFIX}${idx}${IMG_MARKER_SUFFIX}`;
};

function imagePlaceholder(ref: ImageRef): string {
	let out = chalk.yellow('🖼 : ') + chalk.italic(ref.alt);
	if (ref.title) out += chalk.gray(' – ' + ref.title);
	if (ref.href) out += chalk.red(' → ' + ref.href);
	return out;
}

// Fix: marked-terminal's section() appends \n\n to every list, including
// nested ones. When a nested list sits inside a parent list-item the extra
// blank line survives indentation and appears as a visible gap between
// sibling nested items. Additionally, chalk.reset (used by the listitem
// transform) wraps each line of multi-line content, producing lines that
// contain only whitespace + ANSI reset codes. After the outer list's
// indentLines runs, these become indented visually-blank artifact lines.
// We strip both the artifacts and trailing newlines from nested lists.
let listDepth = 0;
const origList = ext.renderer!.list!;
ext.renderer!.list = function (token: Tokens.List) {
	listDepth++;
	const result = origList.call(this, token) as string;
	listDepth--;
	const cleaned = result
		.split('\n')
		.filter((line) => {
			if (line === '') return true;
			// oxlint-disable-next-line no-control-regex
			if (/\u001b\[/.test(line)) {
				const visible = line.replace(ANSI_RE, '').trim();
				return visible.length > 0;
			}
			return true;
		})
		.join('\n');
	if (listDepth > 0) {
		return cleaned.replace(/\n+$/, '');
	}
	return cleaned;
};

// Fix: marked-terminal's blockquote renderer applies the styling function
// to the entire text as one string, so a left-border prefix only appears
// on the first line. Override the renderer to add a │ bar to every line,
// with a dark background that extends to the terminal width.
const BAR = chalk.gray('│');
// Reset list depth before blockquote parsing so nested lists inside
// blockquotes still get proper section spacing.
const savedListDepth = () => {
	const d = listDepth;
	listDepth = 0;
	return d;
};
const restoreListDepth = (d: number) => {
	listDepth = d;
};
ext.renderer!.blockquote = function (quote: Tokens.Blockquote | string) {
	if (typeof quote === 'object') {
		const d = savedListDepth();
		quote = this.parser.parse(quote.tokens);
		restoreListDepth(d);
	}
	// Strip markers from inner blockquotes / code blocks so
	// we can apply a single uniform background across the whole blockquote.
	const clean = (quote as string).replaceAll(BG_MARKER, '');
	const empty = BG_MARKER + `${BAR} `;
	const bordered = clean
		.trim()
		.split('\n')
		.map((line: string) => BG_MARKER + `${BAR} ${line.trimEnd()}`)
		.join('\n');
	return '\n' + empty + '\n' + bordered + '\n' + empty + '\n\n';
};

// Add a dark background to fenced code blocks so they are visually
// distinct from surrounding text and from each other.
const origCode = ext.renderer!.code!;
ext.renderer!.code = function (token: Tokens.Code) {
	const result = origCode.call(this, token) as string;
	const content = result.replace(/\n+$/, '');
	const empty = BG_MARKER;
	const lines = content
		.split('\n')
		.map((line: string) => BG_MARKER + line)
		.join('\n');
	return empty + '\n' + lines + '\n' + empty + '\n\n';
};

const marked = new Marked(ext);

function applyBackgrounds(text: string, width: number): string {
	return text
		.split('\n')
		.map((line) => {
			if (line.startsWith(BG_MARKER)) {
				const content = line.slice(BG_MARKER.length).replaceAll('\t', '    ');
				return bgLine(content, width);
			}
			return line;
		})
		.join('\n');
}

// ── Search highlighting ─────────────────────────────────────────────
const HIGHLIGHT_OPEN = '\u001b[43m\u001b[30m';
const ACTIVE_HIGHLIGHT_OPEN = '\u001b[48;5;208m\u001b[30m';
const HIGHLIGHT_CLOSE = '\u001b[49m\u001b[39m';

function highlightMatches(
	text: string,
	query: string,
	activeMatchIndex: number | null,
): string {
	if (!query) return text;

	const segments: Array<{ ansi: boolean; value: string }> = [];
	const re = new RegExp(ANSI_RE.source, 'g');
	let lastIndex = 0;
	let m: RegExpExecArray | null;

	while ((m = re.exec(text)) !== null) {
		if (m.index > lastIndex) {
			segments.push({ ansi: false, value: text.slice(lastIndex, m.index) });
		}
		segments.push({ ansi: true, value: m[0] });
		lastIndex = re.lastIndex;
	}
	if (lastIndex < text.length) {
		segments.push({ ansi: false, value: text.slice(lastIndex) });
	}

	const visibleText = segments
		.filter((s) => !s.ansi)
		.map((s) => s.value)
		.join('');

	const lowerVisible = visibleText.toLowerCase();
	const lowerQuery = query.toLowerCase();

	const ranges: Array<{ start: number; end: number; active: boolean }> = [];
	let from = 0;
	let matchIdx = 0;
	while (from <= lowerVisible.length - lowerQuery.length) {
		const idx = lowerVisible.indexOf(lowerQuery, from);
		if (idx === -1) break;
		ranges.push({
			start: idx,
			end: idx + lowerQuery.length,
			active: matchIdx === activeMatchIndex,
		});
		matchIdx++;
		from = idx + 1;
	}

	if (ranges.length === 0) return text;

	let result = '';
	let visibleIdx = 0;
	let inHighlight = false;
	let currentActive = false;

	for (const seg of segments) {
		if (seg.ansi) {
			result += seg.value;
			continue;
		}
		for (const ch of seg.value) {
			const range = ranges.find(
				(r) => visibleIdx >= r.start && visibleIdx < r.end,
			);
			const shouldHL = range !== undefined;
			const isActive = range?.active ?? false;

			if (shouldHL && (!inHighlight || currentActive !== isActive)) {
				if (inHighlight) result += HIGHLIGHT_CLOSE;
				result += isActive ? ACTIVE_HIGHLIGHT_OPEN : HIGHLIGHT_OPEN;
				inHighlight = true;
				currentActive = isActive;
			} else if (!shouldHL && inHighlight) {
				result += HIGHLIGHT_CLOSE;
				inHighlight = false;
			}
			result += ch;
			visibleIdx++;
		}
	}
	if (inHighlight) result += HIGHLIGHT_CLOSE;

	return result;
}

export default function Markdown({
	children,
	searchQuery,
	activeMatchIndex,
	paddingX = 0,
	paddingY = 0,
	basePath = '.',
}: Props): React.JSX.Element {
	const { stdout } = useStdout();
	const [columns, setColumns] = React.useState(stdout.columns || 80);

	React.useEffect(() => {
		const onResize = () => setColumns(stdout.columns || 80);
		stdout.on('resize', onResize);
		return () => {
			stdout.off('resize', onResize);
		};
	}, [stdout]);

	const width = columns - paddingX * 2;
	const maxImageHeight = Math.max(1, Math.floor((stdout.rows || 24) * 0.5));

	// Step 1 — parse markdown, collecting image refs as side-effect.
	const { parsed, refs } = React.useMemo(() => {
		imageRefs = [];
		const result = (marked.parse(children) as string).trimEnd();
		return { parsed: result, refs: [...imageRefs] };
	}, [children]);

	// Step 2 — async load images in background.
	const imageCache = useTerminalImages(refs, basePath, width, maxImageHeight);

	// Step 3 — replace image markers with rendered images or placeholders.
	// For native protocols (Kitty/iTerm2), also collect rawData + row
	// positions so we can write them directly to stdout in a useEffect.
	const { withImages, nativeImages } = React.useMemo(() => {
		const natives: Array<{ row: number; data: string }> = [];
		const result = parsed.replace(
			IMG_MARKER_RE,
			(_, idxStr: string, offset: number) => {
				const idx = Number.parseInt(idxStr, 10);
				const ref = refs[idx];
				if (!ref) return '';
				const cached: CachedImage | undefined = imageCache.get(ref.href);
				if (cached) {
					if (cached.rawData) {
						const before = parsed.slice(0, offset);
						const row = (before.match(/\n/g) || []).length;
						natives.push({ row: row + 1, data: cached.rawData });
					}
					return '\n' + cached.text;
				}
				return imagePlaceholder(ref);
			},
		);
		return { withImages: result, nativeImages: natives };
	}, [parsed, refs, imageCache]);

	// Step 3b — write native protocol image data directly to stdout.
	// This bypasses ink's text processing which would corrupt the long
	// escape sequences. We use absolute cursor positioning so the image
	// lands on the correct row, then restore the cursor.
	React.useEffect(() => {
		if (nativeImages.length === 0) return;
		// Delete any previous Kitty images on screen before drawing new ones.
		if (imageProtocol === 'kitty') {
			process.stdout.write('\x1b_Ga=d\x1b\\');
		}
		for (const img of nativeImages) {
			const absRow = paddingY + img.row + 1; // 1-indexed for ANSI
			process.stdout.write('\x1b7'); // save cursor
			process.stdout.write(`\x1b[${absRow};${paddingX + 1}H`); // move
			process.stdout.write(img.data); // write image data
			process.stdout.write('\x1b8'); // restore cursor
		}
	}, [nativeImages, paddingX, paddingY]);

	const withBackgrounds = React.useMemo(
		() => applyBackgrounds(withImages, width),
		[withImages, width],
	);

	const highlighted = React.useMemo(
		() =>
			searchQuery
				? highlightMatches(
						withBackgrounds,
						searchQuery,
						activeMatchIndex ?? null,
					)
				: withBackgrounds,
		[withBackgrounds, searchQuery, activeMatchIndex],
	);

	return <Text>{highlighted}</Text>;
}
