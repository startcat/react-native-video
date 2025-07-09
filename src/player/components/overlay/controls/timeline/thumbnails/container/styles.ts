import DeviceInfo from 'react-native-device-info';
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
    container: {
        flex:1,
        height: DeviceInfo.isTablet() ? 180 : 140,
        width:'100%',
        backgroundColor:'black',
        flexDirection:'row',
        overflow:'hidden'
    },
});
