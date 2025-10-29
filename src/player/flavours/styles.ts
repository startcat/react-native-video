import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: 'black',
	},
	audioContainer: {
		flex: 1,
		backgroundColor: 'transparent',
	},
	playerWrapper: {
		flex: 1,
		justifyContent: 'center',
		alignContent: 'center',
		alignItems: 'center',
		backgroundColor: 'black',
	},
	player: {
		alignSelf: 'center',
		aspectRatio: 16 / 9,
		backgroundColor: 'black',
	},
	audioPlayer: {
		position: 'absolute',
		bottom: -1000,
	},
});
