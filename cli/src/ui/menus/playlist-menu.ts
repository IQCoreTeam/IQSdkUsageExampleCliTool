import { PlaylistService } from "../../apps/playlist/playlist-service";
import { RelationType } from "../../apps/playlist/types";
import { logError, logInfo, logTable } from "../../utils/logger";
import { prompt } from "../../utils/prompt";
import open from "open";

const service = new PlaylistService();

const actionAddSong = async () => {
    console.log("\n--- Add New Song ---");
    const title = await prompt("Title: ");
    const artist = await prompt("Artist: ");
    const bpmStr = await prompt("BPM: ");
    const key = await prompt("Key (e.g. Cmin): ");
    const mood = await prompt("Mood: ");
    const filePath = (await prompt("Audio File Path (optional): ")).trim() || undefined;

    const bpm = parseInt(bpmStr) || 0;

    try {
        logInfo("Adding song to chain (this requires a transaction)...");
        const signature = await service.addSong(title, artist, bpm, key, mood, filePath);
        logInfo(`Success! Signature: ${signature}`);
    } catch (err) {
        logError("Failed to add song", err);
    }
};

const actionLinkSongs = async () => {
    console.log("\n--- Link Songs ---");
    const fromId = (await prompt("From Song ID: ")).trim();
    const toId = (await prompt("To Song ID: ")).trim();
    
    console.log("Relationship Types:");
    Object.values(RelationType).forEach((t, i) => console.log(`${i + 1}) ${t}`));
    const typeIndex = parseInt(await prompt("Select Type [1]: ")) || 1;
    const type = Object.values(RelationType)[typeIndex - 1] || RelationType.SIMILAR_TO;

    try {
        logInfo("Linking songs...");
        const signature = await service.addRelationship(fromId, toId, type);
        logInfo(`Success! Signature: ${signature}`);
    } catch (err) {
        logError("Failed to link songs", err);
    }
}

const actionListSongs = async () => {
    try {
        logInfo("Fetching songs from chain...");
        const songs = await service.getSongs();
        if (songs.length === 0) {
            console.log("No songs found via this RPC on this Root.");
            return;
        }
        logTable(songs.map(s => ({
            ID: s.id,
            Title: s.title,
            Artist: s.artist,
            BPM: s.bpm,
            Mood: s.mood
        })));
    } catch (err) {
        logError("Failed to list songs", err);
    }
};

const actionFindPath = async () => {
    console.log("\n--- Find Path Between Songs ---");
    const startId = (await prompt("Start Song ID: ")).trim();
    const endId = (await prompt("End Song ID: ")).trim();

    try {
        logInfo("Traversing graph...");
        const paths = await service.findPath(startId, endId);
        if (paths.length === 0) {
            console.log("No path found.");
        } else {
            console.log(`Found path of length ${paths[0].length}:`);
            console.log(paths[0].join(" -> "));
        }
    } catch (err) {
        logError("Failed to find path", err);
    }
};

const actionPlaySong = async () => {
    console.log("\n--- Play Song ---");
    const songId = (await prompt("Song ID (leave empty to paste TX directly): ")).trim();

    try {
        let audioTxId = "";
        
        if (!songId) {
             audioTxId = (await prompt("Audio TX Signature: ")).trim();
        } else {
             logInfo("Fetching song details...");
             const songs = await service.getSongs();
             const song = songs.find(s => s.id === songId);
             
             if (!song) {
                 logError("Song not found.");
                 return;
             }
             if (!song.audioTxId) {
                 logError("This song does not have an audio file attached.");
                 return;
             }
             audioTxId = song.audioTxId;
             console.log(`Found audio TX: ${audioTxId}`);
        }

        if (!audioTxId) return;

        logInfo("Streaming audio from chain...");
        const filePath = await service.downloadSongAudio(audioTxId);
        
        console.log(`[info] File ready at: ${filePath}`);
        console.log("[info] Attempting to open media player...");
        try {
            await open(filePath);
            console.log("[info] Player launched.");
        } catch (e: any) {
             console.error(`[error] Failed to launch player: ${e.message}`);
             console.log("[tip] Please open the file manually.");
        }
    } catch (err) {
        logError("Failed to play song", err);
    }
};

const showMenu = () => {
    console.log("\n============================");
    console.log("      Semantic Playlist     ");
    console.log("============================\n");
    console.log("  1) List Songs");
    console.log("  2) Add Song");
    console.log("  3) Link Songs");
    console.log("  4) Find Path (Walk)");
    console.log("  5) Play Song (Stream)");
    console.log("  6) Back");
    console.log("\n============================\n");
};

export const runPlaylistMenu = async () => {
    let running = true;
    while (running) {
        console.clear();
        showMenu();
        const choice = (await prompt("Select option: ")).trim();
        switch (choice) {
            case "1":
                await actionListSongs();
                await prompt("\nPress Enter to continue...");
                break;
            case "2":
                await actionAddSong();
                await prompt("\nPress Enter to continue...");
                break;
            case "3":
                await actionLinkSongs();
                await prompt("\nPress Enter to continue...");
                break;
            case "4":
                await actionFindPath();
                await prompt("\nPress Enter to continue...");
                break;
            case "5":
                await actionPlaySong();
                await prompt("\nPress Enter to continue...");
                break;
            case "6":
                running = false;
                break;
            default:
                console.log("Invalid option");
                await prompt("\nPress Enter to continue...");
        }
    }
};
