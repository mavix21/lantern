import * as React from 'react';
import { Box, Spacer, Text, useStdout } from 'ink';
import Markdown from './components/markdown.js';
import { useNavigation } from './hooks/use-navigation';
import { useAppMode } from './hooks/use-app-mode';
import type { Meta } from './meta';

type Props = {
	slides: string[];
	meta: Meta;
};

const PADDING_X = 4;

export default function App({ slides, meta }: Props): React.JSX.Element {
	const [currentSlide, setCurrentSlide] = React.useState(0);
	const { stdout } = useStdout();

	const {
		mode,
		searchQuery,
		currentMatchIndex,
		totalMatches,
		activeSlideMatchIndex,
		notification,
	} = useAppMode({
		slides,
		currentSlide,
		setCurrentSlide,
		totalSlides: slides.length,
	});

	useNavigation({
		setCurrentSlide,
		totalSlides: slides.length,
		modeKind: mode.kind,
	});

	return (
		<Box
			flexDirection="column"
			height={stdout.rows}
			paddingX={PADDING_X}
			paddingY={2}
		>
			{mode.kind === 'go-to-slide' ? (
				<>
					<Spacer />
					<Box justifyContent="center">
						<Box
							borderStyle="round"
							borderColor="cyan"
							flexDirection="column"
							paddingX={2}
						>
							<Box justifyContent="center">
								<Text bold color="cyan">
									Go to slide
								</Text>
							</Box>
							<Box>
								<Text color="cyan">&gt; </Text>
								<Text>{mode.input}</Text>
								<Text color="gray">█</Text>
							</Box>
						</Box>
					</Box>
					<Spacer />
				</>
			) : (
				<>
					<Markdown
						searchQuery={searchQuery}
						activeMatchIndex={activeSlideMatchIndex}
						paddingX={PADDING_X}
					>
						{slides[currentSlide] ?? ''}
					</Markdown>
					<Spacer />
				</>
			)}
			<Box alignItems="center">
				{notification ? (
					<Box borderStyle="round" borderColor="red" paddingX={1}>
						<Text color="red">{notification}</Text>
					</Box>
				) : mode.kind === 'searching' ? (
					<Box>
						<Text color="yellow">/</Text>
						<Text>{searchQuery}</Text>
						<Text color="gray">█</Text>
					</Box>
				) : mode.kind === 'search-confirmed' ? (
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
					{meta.paging.trim() !== ''
						? meta.paging
								.replace('%d', String(currentSlide + 1))
								.replace('%d', String(slides.length))
						: `Slide ${currentSlide + 1} / ${slides.length}`}
				</Text>
			</Box>
		</Box>
	);
}
