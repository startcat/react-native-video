import { StyleSheet } from 'react-native';

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
    }
});
