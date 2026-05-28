import { Server } from 'socket.io';
export declare const sendToUser: (io: Server, userId: number, event: string, data: any) => boolean;
export declare const getSocketId: (userId: number) => string | undefined;
export declare const setupSocket: (io: Server) => void;
//# sourceMappingURL=socketHandler.d.ts.map