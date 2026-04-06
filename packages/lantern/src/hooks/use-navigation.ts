import * as React from 'react';
import { useApp, useInput } from 'ink';
import type { AppMode } from './use-app-mode';

type UseNavigationProps = {
	setCurrentSlide: React.Dispatch<React.SetStateAction<number>>;
	totalSlides: number;
	modeKind?: AppMode['kind'];
};

export const useNavigation = ({
	setCurrentSlide,
	totalSlides,
	modeKind = 'idle',
}: UseNavigationProps): void => {
	const lastKeyRef = React.useRef('');
	const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

	const { exit } = useApp();

	useInput(
		(input, key) => {
			if (modeKind === 'search-confirmed' && (input === 'n' || input === 'N')) {
				return;
			}

			if (input === 'q') {
				exit();
			}

			if (
				key.rightArrow ||
				key.return ||
				key.pageUp ||
				input === 'n' ||
				input === 'l' ||
				input === ' '
			) {
				setCurrentSlide((slide) => Math.min(slide + 1, totalSlides - 1));
				return;
			}

			if (
				key.leftArrow ||
				key.pageDown ||
				input === 'p' ||
				input === 'N' ||
				input === 'h'
			) {
				setCurrentSlide((slide) => Math.max(slide - 1, 0));
				return;
			}

			if (input === 'G') {
				setCurrentSlide(totalSlides - 1);
				return;
			}

			if (input === 'g') {
				if (timeoutRef.current) {
					clearTimeout(timeoutRef.current);
				}

				if (lastKeyRef.current === 'g') {
					setCurrentSlide(0);
					lastKeyRef.current = '';
					return;
				}

				lastKeyRef.current = 'g';
				timeoutRef.current = setTimeout(() => {
					lastKeyRef.current = '';
				}, 500);
				return;
			}

			lastKeyRef.current = '';
		},
		{ isActive: modeKind === 'idle' || modeKind === 'search-confirmed' },
	);
};
