import * as React from 'react';
import { Text } from 'ink';
import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import type { Tokens } from 'marked';
import chalk from 'chalk';

type Props = {
	children: string;
	searchQuery?: string;
	activeMatchIndex?: number | null;
};

const ext = markedTerminal({
	// chalk.bold (SGR 1) is often rendered as "bright intensity" rather than
	// bold font-weight, making it invisible when the default foreground is
	// already bright. Combine with whiteBright to guarantee contrast.
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
const APP_PADDING = 8; // paddingX={4} in app.tsx → 4 * 2

// eslint-disable-next-line no-control-regex -- intentional: match ANSI SGR sequences
const ANSI_RE = /\u001b\[[0-9;]*m/g;

function visibleLength(str: string): number {
	return str.replace(ANSI_RE, '').length;
}

function contentWidth(): number {
	return (process.stdout.columns || 80) - APP_PADDING;
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

// Fix: marked-terminal's blockquote renderer applies the styling function
// to the entire text as one string, so a left-border prefix only appears
// on the first line. Override the renderer to add a │ bar to every line,
// with a dark background that extends to the terminal width.
const BAR = chalk.gray('│');
ext.renderer!.blockquote = function (quote: Tokens.Blockquote | string) {
	if (typeof quote === 'object') {
		quote = this.parser.parse(quote.tokens);
	}
	const width = contentWidth();
	// Strip background sequences from inner blockquotes / code blocks so
	// we can apply a single uniform background across the whole blockquote.
	const clean = (quote as string)
		.replaceAll(BG_OPEN, '')
		.replaceAll(BG_CLOSE, '');
	const empty = bgLine(`${BAR} `, width);
	const bordered = clean
		.trim()
		.split('\n')
		.map((line: string) => bgLine(`${BAR} ${line.trimEnd()}`, width))
		.join('\n');
	return '\n' + empty + '\n' + bordered + '\n' + empty + '\n\n';
};

// Add a dark background to fenced code blocks so they are visually
// distinct from surrounding text and from each other.
const origCode = ext.renderer!.code!;
ext.renderer!.code = function (token: Tokens.Code) {
	const result = origCode.call(this, token) as string;
	const width = contentWidth();
	const content = result.replace(/\n+$/, '');
	const empty = bgLine('', width);
	const lines = content
		.split('\n')
		.map((line: string) => bgLine(line, width))
		.join('\n');
	return empty + '\n' + lines + '\n' + empty + '\n\n';
};

const marked = new Marked(ext);

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
}: Props): React.JSX.Element {
	const rendered = React.useMemo(
		() => (marked.parse(children) as string).trimEnd(),
		[children],
	);

	const highlighted = React.useMemo(
		() =>
			searchQuery
				? highlightMatches(rendered, searchQuery, activeMatchIndex ?? null)
				: rendered,
		[rendered, searchQuery, activeMatchIndex],
	);

	return <Text>{highlighted}</Text>;
}
