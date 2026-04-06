import * as React from 'react';
import { Box, Spacer, Text, useStdout } from 'ink';
import Markdown from './components/markdown.js';
import { useNavigation } from './hooks/use-navigation';
import { useSearch } from './hooks/use-search';
import type { Meta } from './meta';

type Props = {
	slides: string[];
	meta: Meta;
};

export default function App({ slides, meta }: Props): React.JSX.Element {
	const [currentSlide, setCurrentSlide] = React.useState(0);
	const { stdout } = useStdout();

	const {
		searchState,
		searchQuery,
		currentMatchIndex,
		totalMatches,
		activeSlideMatchIndex,
	} = useSearch({ slides, currentSlide, setCurrentSlide });

	useNavigation({
		setCurrentSlide,
		totalSlides: slides.length,
		searchState,
	});

	return (
		<Box flexDirection="column" height={stdout.rows} paddingX={4} paddingY={2}>
			<Markdown
				searchQuery={searchQuery}
				activeMatchIndex={activeSlideMatchIndex}
			>
				{slides[currentSlide] ?? ''}
			</Markdown>
			<Spacer />
			<Box alignItems="center">
				{searchState === 'searching' ? (
					<Box>
						<Text color="yellow">/</Text>
						<Text>{searchQuery}</Text>
						<Text color="gray">█</Text>
					</Box>
				) : searchState === 'confirmed' ? (
					<Box>
						<Text color="yellow">/</Text>
						<Text>{searchQuery}</Text>
						<Text> </Text>
						<Text color="gray">
							[{currentMatchIndex + 1}/{totalMatches}]
						</Text>
					</Box>
				) : (
					<Box>
						<Text color="blue">{meta.author}</Text>
						<Text> </Text>
						<Text color="gray">{meta.date}</Text>
					</Box>
				)}
				<Spacer />
				<Text color="blue">
					Slide {currentSlide + 1} / {slides.length}
				</Text>
			</Box>
		</Box>
	);
}
