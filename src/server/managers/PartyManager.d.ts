export interface PartyMember {
    userId: number;
    username: string;
    isLeader: boolean;
    isReady: boolean;
}
export interface Party {
    id: string;
    leaderId: number;
    members: PartyMember[];
    modeId?: string;
}
declare class PartyManager {
    private parties;
    private userToParty;
    createParty(leaderId: number, username: string): Party;
    getParty(partyId: string): Party | undefined;
    getUserParty(userId: number): Party | undefined;
    joinParty(partyId: string, userId: number, username: string): Party | null;
    leaveParty(userId: number): Party | null;
    kickMember(partyId: string, targetUserId: number): Party | null;
    toggleReady(partyId: string, userId: number): Party | null;
}
export declare const partyManager: PartyManager;
export {};
//# sourceMappingURL=PartyManager.d.ts.map