/*
 *  Provider para componentes del Player
 *
 */

// import React, { createContext, useContext } from 'react';
// import { type PlayerProviderProps } from './types';

// const PlayerContext = createContext<PlayerContextType | null>(null);

// export const PlayerProvider: React.FC<PlayerProviderProps> = ({
//     children,
// }) => {

//     const createConnector = (): void => {
//         return;
//     };

//     return (
//         <PlayerContext.Provider value={{ createConnector }}>
//             {children}
//         </PlayerContext.Provider>
//     );
// };

// export const usePlayerProvider = (): PlayerContextType => {
//     const context = useContext(PlayerContext);
//     if (!context) {
//         throw new Error('usePlayerProvider must be used within a PlayerProvider');
//     }
//     return context;
// };
