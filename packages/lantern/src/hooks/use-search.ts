import * as React from 'react';
import { useInput } from 'ink';

export type SearchState = 'idle' | 'searching' | 'confirmed';

type MatchLocation = {
	slideIndex: number;
	matchIndexInSlide: number;
};

type UseSearchProps = {
	slides: string[];
	currentSlide: number;
	setCurrentSlide: React.Dispatch<React.SetStateAction<number>>;
};

type UseSearchResult = {
	searchState: SearchState;
	searchQuery: string;
	currentMatchIndex: number;
	totalMatches: number;
	activeSlideMatchIndex: number | null;
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

export const useSearch = ({
	slides,
	currentSlide,
	setCurrentSlide,
}: UseSearchProps): UseSearchResult => {
	const [searchState, setSearchState] = React.useState<SearchState>('idle');
	const [searchQuery, setSearchQuery] = React.useState('');
	const [currentMatchIndex, setCurrentMatchIndex] = React.useState(0);

	const allMatches = React.useMemo(
		() => findAllMatches(slides, searchQuery),
		[slides, searchQuery],
	);

	const activeSlideMatchIndex = React.useMemo(() => {
		if (searchState !== 'confirmed' || allMatches.length === 0) {
			return null;
		}

		const match = allMatches[currentMatchIndex];
		if (!match || match.slideIndex !== currentSlide) {
			return null;
		}

		return match.matchIndexInSlide;
	}, [searchState, allMatches, currentMatchIndex, currentSlide]);

	useInput((input, key) => {
		// ── idle ────────────────────────────────────────────────────────
		if (searchState === 'idle') {
			if (input === '/') {
				setSearchState('searching');
				setSearchQuery('');
				setCurrentMatchIndex(0);
			}
			return;
		}

		// ── searching ──────────────────────────────────────────────────
		if (searchState === 'searching') {
			if (key.escape) {
				setSearchState('idle');
				setSearchQuery('');
				return;
			}

			if (key.return) {
				if (allMatches.length > 0) {
					setSearchState('confirmed');
					const idx = allMatches.findIndex((m) => m.slideIndex >= currentSlide);
					const matchIdx = idx !== -1 ? idx : 0;
					setCurrentMatchIndex(matchIdx);
					const match = allMatches[matchIdx];
					if (match && match.slideIndex !== currentSlide) {
						setCurrentSlide(match.slideIndex);
					}
				} else {
					setSearchState('idle');
					setSearchQuery('');
				}
				return;
			}

			if (key.backspace || key.delete) {
				setSearchQuery((q) => {
					if (q.length === 0) {
						setSearchState('idle');
						return '';
					}
					return q.slice(0, -1);
				});
				return;
			}

			if (input && !key.ctrl && !key.meta) {
				setSearchQuery((q) => q + input);
			}
			return;
		}

		// ── confirmed ──────────────────────────────────────────────────
		if (searchState === 'confirmed') {
			if (key.escape) {
				setSearchState('idle');
				setSearchQuery('');
				return;
			}

			if (input === '/') {
				setSearchState('searching');
				setSearchQuery('');
				setCurrentMatchIndex(0);
				return;
			}

			if (input === 'n' && allMatches.length > 0) {
				const nextIndex = (currentMatchIndex + 1) % allMatches.length;
				setCurrentMatchIndex(nextIndex);
				const match = allMatches[nextIndex];
				if (match && match.slideIndex !== currentSlide) {
					setCurrentSlide(match.slideIndex);
				}
				return;
			}

			if (input === 'N' && allMatches.length > 0) {
				const prevIndex =
					(currentMatchIndex - 1 + allMatches.length) % allMatches.length;
				setCurrentMatchIndex(prevIndex);
				const match = allMatches[prevIndex];
				if (match && match.slideIndex !== currentSlide) {
					setCurrentSlide(match.slideIndex);
				}
				return;
			}
		}
	});

	return {
		searchState,
		searchQuery,
		currentMatchIndex,
		totalMatches: allMatches.length,
		activeSlideMatchIndex,
	};
};
