import { StyleSheet } from 'react-native';
import { SPACING } from '../../theme';

export const styles = StyleSheet.create({
    container:{
        height: 60,
        backgroundColor:'black'
    },
    inner:{
        flex:1
    },
    audioPlayer:{
        position:'absolute',
        bottom:-1000
    },
    audioPlayerTopDivider:{
        top:0,
        height:1,
        width:'100%',
        backgroundColor:'#303030'
    },
    contents:{
        flex:1,
        margin:SPACING['0.5x'],
        justifyContent:'center',
        alignItems:'center'
    },
});
