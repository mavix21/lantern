import * as React from 'react';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import chalk from 'chalk';

export type ImageRef = {
	href: string;
	alt: string;
	title: string | null;
};

// ── Protocol detection ──────────────────────────────────────────────
// Native protocols render at full pixel resolution inside the terminal.
// Block characters are a universal fallback (~1px per column).
type ImageProtocol = 'iterm2' | 'kitty' | 'block';

function detectProtocol(): ImageProtocol {
	const tp = process.env['TERM_PROGRAM'] ?? '';
	const lt = process.env['LC_TERMINAL'] ?? '';
	const term = process.env['TERM'] ?? '';
	if (term === 'xterm-kitty' || tp === 'ghostty') return 'kitty';
	if (tp === 'iTerm.app' || tp === 'WezTerm' || lt === 'iTerm2')
		return 'iterm2';
	return 'block';
}

const protocol = detectProtocol();

// ── iTerm2 inline image protocol ────────────────────────────────────
// Embeds base64-encoded image data in an OSC escape sequence.
// The terminal renders at full pixel resolution within the cell area.
async function renderITerm2(
	filePath: string,
	maxCols: number,
	maxRows: number,
): Promise<string> {
	const [fileBuffer, meta] = await Promise.all([
		readFile(filePath),
		sharp(filePath).metadata(),
	]);
	if (!meta.width || !meta.height) throw new Error('unreadable image');

	// Estimate how many terminal rows the image will occupy so we can
	// pad with newlines for ink's layout. Cells are roughly 1:2 (w:h).
	const imgAspect = meta.height / meta.width;
	const estimatedRows = Math.min(
		maxRows,
		Math.max(1, Math.ceil((maxCols * imgAspect) / 2)),
	);

	const b64 = fileBuffer.toString('base64');
	const esc =
		`\x1b]1337;File=inline=1;width=${maxCols};height=${estimatedRows}` +
		`;preserveAspectRatio=1;size=${fileBuffer.length}:${b64}\x07`;

	// Ink counts lines via \n. Pad so content below the image starts
	// after the image area.
	const spacer = '\n'.repeat(Math.max(0, estimatedRows - 1));
	return esc + spacer;
}

// ── Kitty graphics protocol ─────────────────────────────────────────
// Sends a PNG-encoded image in chunked APC escape sequences.
async function renderKitty(
	filePath: string,
	maxCols: number,
	maxRows: number,
): Promise<string> {
	const meta = await sharp(filePath).metadata();
	if (!meta.width || !meta.height) throw new Error('unreadable image');

	const imgAspect = meta.height / meta.width;
	const estimatedRows = Math.min(
		maxRows,
		Math.max(1, Math.ceil((maxCols * imgAspect) / 2)),
	);

	// Convert to PNG (required by Kitty f=100).
	const pngBuffer = await sharp(filePath).png().toBuffer();
	const b64 = pngBuffer.toString('base64');

	let result = '';
	const chunkSize = 4096;
	for (let i = 0; i < b64.length; i += chunkSize) {
		const chunk = b64.slice(i, i + chunkSize);
		const isFirst = i === 0;
		const isLast = i + chunkSize >= b64.length;
		if (isFirst) {
			result += `\x1b_Gf=100,a=T,c=${maxCols},r=${estimatedRows},m=${isLast ? 0 : 1};${chunk}\x1b\\`;
		} else {
			result += `\x1b_Gm=${isLast ? 0 : 1};${chunk}\x1b\\`;
		}
	}

	const spacer = '\n'.repeat(Math.max(0, estimatedRows - 1));
	return result + spacer;
}

// ── Block-character fallback ────────────────────────────────────────
// Uses ▄ (lower half block): bg colour = top pixel, fg = bottom pixel.
// Gives 2 vertical pixels per character cell. Mild sharpening helps
// compensate for the inherent resolution loss.
const PIXEL = '\u2584';

async function renderBlock(
	filePath: string,
	maxCols: number,
	maxRows: number,
): Promise<string> {
	const image = sharp(filePath);
	const meta = await image.metadata();
	if (!meta.width || !meta.height) throw new Error('unreadable image');

	const maxPixelH = maxRows * 2;
	const scale = Math.min(maxCols / meta.width, maxPixelH / meta.height);
	const w = Math.max(1, Math.round(meta.width * scale));
	const h = Math.max(2, Math.round(meta.height * scale));

	const { data, info } = await image
		.resize(w, h, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
		.sharpen({ sigma: 0.5 })
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	const lines: string[] = [];
	for (let y = 0; y < info.height - 1; y += 2) {
		let line = '';
		for (let x = 0; x < info.width; x++) {
			const topOff = (y * info.width + x) * 3;
			const botOff = ((y + 1) * info.width + x) * 3;
			const tr = data[topOff]!,
				tg = data[topOff + 1]!,
				tb = data[topOff + 2]!;
			const br = data[botOff]!,
				bg = data[botOff + 1]!,
				bb = data[botOff + 2]!;
			line += chalk.bgRgb(tr, tg, tb).rgb(br, bg, bb)(PIXEL);
		}
		lines.push(line);
	}

	return lines.join('\n');
}

// ── Unified renderer ────────────────────────────────────────────────
async function renderImage(
	filePath: string,
	maxCols: number,
	maxRows: number,
): Promise<string> {
	if (protocol === 'iterm2') return renderITerm2(filePath, maxCols, maxRows);
	if (protocol === 'kitty') return renderKitty(filePath, maxCols, maxRows);
	return renderBlock(filePath, maxCols, maxRows);
}

// Global cache so images persist across slide navigation and re-renders.
const globalCache = new Map<string, string>();

/**
 * Asynchronously loads and renders images referenced in markdown slides.
 * Uses native terminal image protocols (iTerm2, Kitty) when available for
 * full pixel-quality rendering, falling back to ANSI block characters.
 * Returns a map of `href → rendered string`.
 */
export function useTerminalImages(
	refs: ImageRef[],
	basePath: string,
	width: number,
	maxHeight: number,
): Map<string, string> {
	const [cache, setCache] = React.useState<Map<string, string>>(
		() => new Map(globalCache),
	);

	// Deduplicated list of hrefs that actually need loading.
	const hrefs = React.useMemo(() => {
		const unique = new Set<string>();
		for (const r of refs) {
			if (r.href) unique.add(r.href);
		}
		return [...unique];
	}, [refs]);

	React.useEffect(() => {
		let cancelled = false;

		async function load() {
			const pending = hrefs.filter((h) => !globalCache.has(h));
			if (pending.length === 0) return;

			for (const href of pending) {
				if (cancelled) return;
				try {
					const resolved = path.isAbsolute(href)
						? href
						: path.resolve(basePath, href);
					const rendered = await renderImage(resolved, width, maxHeight);
					globalCache.set(href, rendered);
				} catch {
					// Mark as failed so we don't retry every render.
					globalCache.set(href, '');
				}
			}

			if (!cancelled) {
				setCache(new Map(globalCache));
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [hrefs, basePath, width, maxHeight]);

	return cache;
}
