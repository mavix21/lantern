import * as React from 'react';
import { useInput } from 'ink';

// ── Mode types ──────────────────────────────────────────────────────
export type AppMode =
	| { kind: 'idle' }
	| { kind: 'searching'; query: string }
	| { kind: 'search-confirmed'; query: string; matchIndex: number }
	| { kind: 'go-to-slide'; input: string };

// ── Match helpers ───────────────────────────────────────────────────
type MatchLocation = {
	slideIndex: number;
	matchIndexInSlide: number;
};

function findAllMatches(slides: string[], query: string): MatchLocation[] {
	if (!query) return [];
	const matches: MatchLocation[] = [];
	const lowerQuery = query.toLowerCase();
	for (let i = 0; i < slides.length; i++) {
		const lowerSlide = slides[i]!.toLowerCase();
		let pos = 0;
		let matchInSlide = 0;
		while (pos <= lowerSlide.length - lowerQuery.length) {
			const idx = lowerSlide.indexOf(lowerQuery, pos);
			if (idx === -1) break;
			matches.push({ slideIndex: i, matchIndexInSlide: matchInSlide });
			matchInSlide++;
			pos = idx + 1;
		}
	}
	return matches;
}

// ── Hook props & result ─────────────────────────────────────────────
type UseAppModeProps = {
	slides: string[];
	currentSlide: number;
	setCurrentSlide: React.Dispatch<React.SetStateAction<number>>;
	totalSlides: number;
};

type UseAppModeResult = {
	mode: AppMode;
	searchQuery: string;
	totalMatches: number;
	currentMatchIndex: number;
	activeSlideMatchIndex: number | null;
	notification: string | null;
};

// ── Hook ────────────────────────────────────────────────────────────
export const useAppMode = ({
	slides,
	currentSlide,
	setCurrentSlide,
	totalSlides,
}: UseAppModeProps): UseAppModeResult => {
	const [mode, setMode] = React.useState<AppMode>({ kind: 'idle' });
	const [notification, setNotification] = React.useState<string | null>(null);
	const notificationTimer = React.useRef<NodeJS.Timeout | null>(null);

	React.useEffect(() => {
		return () => {
			if (notificationTimer.current) clearTimeout(notificationTimer.current);
		};
	}, []);

	function notify(message: string) {
		if (notificationTimer.current) clearTimeout(notificationTimer.current);
		setNotification(message);
		notificationTimer.current = setTimeout(() => setNotification(null), 2000);
	}

	// Derive search query from mode
	const searchQuery =
		mode.kind === 'searching' || mode.kind === 'search-confirmed'
			? mode.query
			: '';

	const currentMatchIndex =
		mode.kind === 'search-confirmed' ? mode.matchIndex : 0;

	const allMatches = React.useMemo(
		() => findAllMatches(slides, searchQuery),
		[slides, searchQuery],
	);

	const activeSlideMatchIndex = React.useMemo(() => {
		if (mode.kind !== 'search-confirmed' || allMatches.length === 0) {
			return null;
		}

		const match = allMatches[currentMatchIndex];
		if (!match || match.slideIndex !== currentSlide) {
			return null;
		}

		return match.matchIndexInSlide;
	}, [mode.kind, allMatches, currentMatchIndex, currentSlide]);

	useInput((input, key) => {
		// ── idle ──────────────────────────────────────────────────────
		if (mode.kind === 'idle') {
			if (input === '/') {
				setMode({ kind: 'searching', query: '' });
			} else if (input === ':') {
				setMode({ kind: 'go-to-slide', input: '' });
			}
			return;
		}

		// ── searching ────────────────────────────────────────────────
		if (mode.kind === 'searching') {
			if (key.escape) {
				setMode({ kind: 'idle' });
				return;
			}

			if (key.return) {
				if (allMatches.length > 0) {
					const idx = allMatches.findIndex(
						(m) => m.slideIndex >= currentSlide,
					);
					const matchIdx = idx !== -1 ? idx : 0;
					setMode({
						kind: 'search-confirmed',
						query: mode.query,
						matchIndex: matchIdx,
					});
					const match = allMatches[matchIdx];
					if (match && match.slideIndex !== currentSlide) {
						setCurrentSlide(match.slideIndex);
					}
				} else {
					setMode({ kind: 'idle' });
				}
				return;
			}

			if (key.backspace || key.delete) {
				if (mode.query.length === 0) {
					setMode({ kind: 'idle' });
				} else {
					setMode({ kind: 'searching', query: mode.query.slice(0, -1) });
				}
				return;
			}

			if (input && !key.ctrl && !key.meta) {
				setMode({ kind: 'searching', query: mode.query + input });
			}
			return;
		}

		// ── search-confirmed ─────────────────────────────────────────
		if (mode.kind === 'search-confirmed') {
			if (key.escape) {
				setMode({ kind: 'idle' });
				return;
			}

			if (input === '/') {
				setMode({ kind: 'searching', query: '' });
				return;
			}

			if (input === ':') {
				setMode({ kind: 'go-to-slide', input: '' });
				return;
			}

			if (input === 'n' && allMatches.length > 0) {
				const next = (mode.matchIndex + 1) % allMatches.length;
				setMode({
					kind: 'search-confirmed',
					query: mode.query,
					matchIndex: next,
				});
				const match = allMatches[next];
				if (match && match.slideIndex !== currentSlide) {
					setCurrentSlide(match.slideIndex);
				}
				return;
			}

			if (input === 'N' && allMatches.length > 0) {
				const prev =
					(mode.matchIndex - 1 + allMatches.length) % allMatches.length;
				setMode({
					kind: 'search-confirmed',
					query: mode.query,
					matchIndex: prev,
				});
				const match = allMatches[prev];
				if (match && match.slideIndex !== currentSlide) {
					setCurrentSlide(match.slideIndex);
				}
				return;
			}
			return;
		}

		// ── go-to-slide ──────────────────────────────────────────────
		if (mode.kind === 'go-to-slide') {
			if (key.escape) {
				setMode({ kind: 'idle' });
				return;
			}

			if (key.return) {
				const num = parseInt(mode.input, 10);
				if (!Number.isNaN(num) && num >= 1 && num <= totalSlides) {
					setCurrentSlide(num - 1);
				} else if (mode.input.length > 0) {
					notify(`No such slide: ${mode.input}`);
				}
				setMode({ kind: 'idle' });
				return;
			}

			if (key.backspace || key.delete) {
				if (mode.input.length === 0) {
					setMode({ kind: 'idle' });
				} else {
					setMode({
						kind: 'go-to-slide',
						input: mode.input.slice(0, -1),
					});
				}
				return;
			}

			if (input && /^\d$/.test(input)) {
				setMode({ kind: 'go-to-slide', input: mode.input + input });
			}
			return;
		}
	});

	return {
		mode,
		searchQuery,
		totalMatches: allMatches.length,
		currentMatchIndex,
		activeSlideMatchIndex,
		notification,
	};
};
