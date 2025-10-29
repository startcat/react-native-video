import { StyleSheet } from 'react-native';
import { SPACING } from '../../../../../theme';

export const styles = StyleSheet.create({
	container: {
		paddingVertical: SPACING['0.25x'],
		paddingHorizontal: SPACING['0.75x'],
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: SPACING['1x'],
		marginLeft: SPACING['0.5x'],
		alignSelf: 'center',
		backgroundColor: 'rgba(255, 255, 255, 0.15)',
		borderColor: 'rgba(255, 255, 255, 0.3)',
		borderWidth: 1,
		borderRadius: 3,
	},
	asButton: {
		borderColor: 'white',
		backgroundColor: 'rgba(0, 0, 0, 0.5)',
	},
	title: {
		color: 'white',
	},
});
