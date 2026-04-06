import * as React from 'react';
import { Box, Text, useStdout } from 'ink';
import { useNavigation } from '../hooks/use-navigation';

export default function Empty(): React.JSX.Element {
	const { stdout } = useStdout();

	useNavigation({
		setCurrentSlide: () => {},
		totalSlides: 0,
	});

	return (
		<Box
			flexDirection="column"
			height={stdout.rows}
			justifyContent="center"
			alignItems="center"
			paddingX={4}
			paddingY={2}
		>
			<Box borderStyle="round" padding={4} borderColor="magenta">
				<Text>No content available</Text>
			</Box>
		</Box>
	);
}
