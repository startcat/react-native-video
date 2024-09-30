import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
    container:{
        flex:1,
        backgroundColor:'black'
    },
    playerWrapper:{
        flex:1,
        justifyContent:'center',
        alignContent:'center',
        alignItems:'center',
        backgroundColor:'black'
    },
    player:{
        flex:1,
        alignSelf:'center',
        aspectRatio:16/9,
        backgroundColor:'black'
    }
});
