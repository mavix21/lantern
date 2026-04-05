import * as React from 'react';
import { useApp, useInput } from 'ink';

type UseNavigationProps = {
	setCurrentSlide: React.Dispatch<React.SetStateAction<number>>;
	totalSlides: number;
};

export const useNavigation = ({
	setCurrentSlide,
	totalSlides,
}: UseNavigationProps): void => {
	const lastKeyRef = React.useRef('');
	const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

	const { exit } = useApp();

	useInput((input, key) => {
		// Handle input here
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
		}
		if (
			key.leftArrow ||
			key.pageDown ||
			input === 'p' ||
			input === 'N' ||
			input === 'h'
		) {
			setCurrentSlide((slide) => Math.max(slide - 1, 0));
		}
		if (input === 'G') {
			setCurrentSlide(totalSlides - 1);
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
	});
};
