export interface Song {
    id: string;
    title: string;
    artist: string;
    bpm: number;
    key: string;
    mood: string;
    timestamp: number;
    audioTxId?: string; 
}

export enum RelationType {
    SAMPLES = "SAMPLES",
    INSPIRED_BY = "INSPIRED_BY",
    REMIX_OF = "REMIX_OF",
    SIMILAR_TO = "SIMILAR_TO",
    COVERS = "COVERS",
}

export interface Relationship {
    id: string;
    fromId: string;
    toId: string;
    type: RelationType;
    timestamp: number;
}
