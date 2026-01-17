import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import * as os from "node:os";
import {
    PublicKey,
    SystemProgram,
    SendTransactionError,
    Transaction,
    sendAndConfirmTransaction,
    type TransactionInstruction,
} from "@solana/web3.js";
import type { Connection, Signer } from "@solana/web3.js";
import { BorshAccountsCoder, type Idl } from "@coral-xyz/anchor";
import iqlabs from "iqlabs-sdk/src";
import * as fs from "node:fs";
import * as path from "node:path";
import { getWalletCtx } from "../../utils/wallet_manager";
import { Song, Relationship, RelationType } from "./types";
import { chunkString, DEFAULT_CHUNK_SIZE } from "../../utils/chunk";

const require = createRequire(import.meta.url);
const IDL = require("iqlabs-sdk/idl/code_in.json") as Idl;

const DEFAULT_ROOT_ID = "playlist-v1";
const SONGS_TABLE_NAME = "songs_v2";
const RELATIONS_TABLE_NAME = "song_relations";

const ID_COL = "id";















const sendInstruction = async (
    connection: Connection,
    signer: Signer,
    instruction: TransactionInstruction,
) => {
    const tx = new Transaction().add(instruction);
    try {
        return await sendAndConfirmTransaction(connection, tx, [signer]);
    } catch (err) {
        if (err instanceof SendTransactionError) {
            try {
                const logs = await err.getLogs(connection);
                if (logs.length > 0) {
                    console.error("Transaction logs:", logs);
                }
            } catch {
                
            }
        }
        throw err;
    }
};

const sha256 = (input: string): Buffer => {
    return createHash("sha256").update(input).digest();
};

export class PlaylistService {
    readonly connection: Connection;
    readonly signer: Signer;
    readonly dbRootId: Uint8Array;
    readonly programId: PublicKey;
    readonly builder: ReturnType<typeof iqlabs.contract.createInstructionBuilder>;
    readonly accountCoder: BorshAccountsCoder;

    constructor(rootId = DEFAULT_ROOT_ID) {
        const { connection, signer } = getWalletCtx();
        this.connection = connection;
        this.signer = signer;
        
        this.dbRootId = sha256(rootId);
        this.programId = iqlabs.contract.getProgramId();
        this.builder = iqlabs.contract.createInstructionBuilder(IDL, this.programId);
        this.accountCoder = new BorshAccountsCoder(IDL);
    }

    async ensureRootAndTables() {
        
        const dbRoot = iqlabs.contract.getDbRootPda(this.dbRootId, this.programId);
        const rootInfo = await this.connection.getAccountInfo(dbRoot);
        
        if (!rootInfo) {
            console.log("Creating DB Root...");
            const ix = iqlabs.contract.initializeDbRootInstruction(
                this.builder,
                {
                    db_root: dbRoot,
                    signer: this.signer.publicKey,
                    system_program: SystemProgram.programId,
                },
                { db_root_id: this.dbRootId },
            );
            await sendInstruction(this.connection, this.signer, ix);
        }

        
        
        const songsCols = ["id", "title", "artist", "bpm", "key", "mood", "timestamp", "audioTxId"];
        await this.ensureTable(SONGS_TABLE_NAME, songsCols);

        
        const relationsCols = ["id", "fromId", "toId", "type", "timestamp"];
        await this.ensureTable(RELATIONS_TABLE_NAME, relationsCols);
    }

    private async ensureTable(tableName: string, columns: string[]) {
        const dbRoot = iqlabs.contract.getDbRootPda(this.dbRootId, this.programId);
        
        const tableSeed = sha256(tableName);
        const tableSeedBuf = Buffer.from(tableSeed);
        const table = iqlabs.contract.getTablePda(dbRoot, tableSeed, this.programId);
        const instructionTable = iqlabs.contract.getInstructionTablePda(
            dbRoot,
            tableSeed,
            this.programId,
        );

        const info = await this.connection.getAccountInfo(table);
        if (info) return { table, created: false };

        console.log(`Creating table: ${tableName}...`);
        const ix = iqlabs.contract.createTableInstruction(
            this.builder,
            {
                db_root: dbRoot,
                receiver: new PublicKey(iqlabs.constants.DEFAULT_WRITE_FEE_RECEIVER),
                signer: this.signer.publicKey,
                table,
                instruction_table: instructionTable,
                system_program: SystemProgram.programId,
            },
            {
                db_root_id: this.dbRootId,
                table_seed: tableSeedBuf,
                table_name: Buffer.from(tableName, "utf8"),
                column_names: columns.map((name) => Buffer.from(name, "utf8")),
                id_col: Buffer.from(ID_COL, "utf8"),
                ext_keys: [],
                gate_mint_opt: null,
                writers_opt: null,
            },
        );
        await sendInstruction(this.connection, this.signer, ix);
        return { table, created: true };
    }

    async addSong(title: string, artist: string, bpm: number, key: string, mood: string, filePath?: string) {
        console.log("Ensuring root and tables...");
        await this.ensureRootAndTables();
        const id = randomUUID();

        let audioTxId: string | undefined;
        
        let sanitizedPath = filePath;
        if (sanitizedPath) {
             
             sanitizedPath = sanitizedPath.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
             sanitizedPath = sanitizedPath.replace(/^\\\\wsl\.localhost\\Ubuntu/, "");
             sanitizedPath = sanitizedPath.replace(/\\/g, "/");
        }

        if (sanitizedPath) {
            if (!fs.existsSync(sanitizedPath)) {
                throw new Error(`Audio file not found at: ${sanitizedPath}`);
            }

            console.log(`Found audio file at: ${sanitizedPath}`);
            console.log("Reading file...");
            const filename = path.basename(sanitizedPath);
            const fileData = fs.readFileSync(sanitizedPath).toString("base64");

            const chunks = chunkString(fileData, DEFAULT_CHUNK_SIZE);
            console.log(`File read. Split into ${chunks.length} chunks. Starting upload...`);
            
            audioTxId = await iqlabs.writer.codeIn(
                { connection: this.connection, signer: this.signer },
                chunks,
                undefined, 
                filename,
                0, 
                "audio/base64", 
                (percent: number) => {
                     if (process.stdout.isTTY) {
                        process.stdout.clearLine(0);
                        process.stdout.cursorTo(0);
                        process.stdout.write(`  Upload Progress: ${percent}%`);
                     }
                }
            );

            if (process.stdout.isTTY) process.stdout.write("\n");
            console.log(`Audio upload complete. TxId: ${audioTxId}`);
        } else if (filePath) {
            console.warn(`File not found at path: ${sanitizedPath} (Original: ${filePath})`);
        }

        console.log("Preparing metadata row...");
        const song: Song = {
            id,
            title,
            artist,
            bpm,
            key,
            mood,
            timestamp: Date.now(),
            audioTxId,
        };

        const rowJson = JSON.stringify(song);
        const tableSeed = sha256(SONGS_TABLE_NAME);

        console.log(`Writing song row to table (seed hash: ${tableSeed.toString('hex').slice(0, 8)}...)...`);
        return iqlabs.writer.writeRow(
            this.connection,
            this.signer,
            this.dbRootId,
            tableSeed,
            rowJson,
        );
    }

    async addRelationship(fromId: string, toId: string, type: RelationType) {
        await this.ensureRootAndTables();
        const id = randomUUID();
        const relation: Relationship = {
            id,
            fromId,
            toId,
            type,
            timestamp: Date.now(),
        };
        const rowJson = JSON.stringify(relation);
        const tableSeed = sha256(RELATIONS_TABLE_NAME);
        return iqlabs.writer.writeRow(
            this.connection,
            this.signer,
            this.dbRootId,
            tableSeed,
            rowJson,
        );
    }

    async getSongs(limit = 50): Promise<Song[]> {
        const dbRoot = iqlabs.contract.getDbRootPda(this.dbRootId, this.programId);
        const tableSeed = sha256(SONGS_TABLE_NAME);
        const table = iqlabs.contract.getTablePda(dbRoot, tableSeed, this.programId);
        const rows = await iqlabs.reader.readTableRows(table, { limit });
        return rows as unknown as Song[];
    }

    async getRelationships(limit = 1000): Promise<Relationship[]> {
        const dbRoot = iqlabs.contract.getDbRootPda(this.dbRootId, this.programId);
        const tableSeed = sha256(RELATIONS_TABLE_NAME);
        const table = iqlabs.contract.getTablePda(dbRoot, tableSeed, this.programId); 
        const rows = await iqlabs.reader.readTableRows(table, { limit });
        return rows as unknown as Relationship[];
    }


    
    async findPath(startSongId: string, endSongId: string): Promise<string[][]> {
        const relations = await this.getRelationships(1000);
        const adj = new Map<string, string[]>();
        for (const r of relations) {
            if (!adj.has(r.fromId)) adj.set(r.fromId, []);
            adj.get(r.fromId)!.push(r.toId);
            if (r.type === RelationType.SIMILAR_TO) {
                 if (!adj.has(r.toId)) adj.set(r.toId, []);
                 adj.get(r.toId)!.push(r.fromId);
            }
        }

        
        const queue: string[][] = [[startSongId]];
        const visited = new Set<string>();
        visited.add(startSongId);

        while (queue.length > 0) {
            const path = queue.shift()!;
            const node = path[path.length - 1];
            if (node === endSongId) {
                return [path]; 
            }
            const neighbors = adj.get(node) || [];
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    const newPath = [...path, neighbor];
                    queue.push(newPath);
                }
            }
        }
        return [];
    }

    async downloadSongAudio(audioTxId: string): Promise<string> {
        console.log(`fetching audio data from tx: ${audioTxId}...`);
        
        
        const downloadsDir = path.join(process.cwd(), "downloads");
        if (!fs.existsSync(downloadsDir)) {
            fs.mkdirSync(downloadsDir, { recursive: true });
        }

        let lastPercent = -1;
        const result = await iqlabs.reader.readCodeIn(
            audioTxId, 
<<<<<<< HEAD
            "light", 
=======
            "light",
>>>>>>> 0cbcc80 (update the connection pda for getting rootid)
            (percent: number) => {
                if (Math.floor(percent) > lastPercent) {
                    lastPercent = Math.floor(percent);
                    if (process.stdout.isTTY) {
                        process.stdout.clearLine(0);
                        process.stdout.cursorTo(0);
                        process.stdout.write(`Downloading... ${percent.toFixed(0)}%`);
                    }
                }
            }
        );
        
        if (process.stdout.isTTY) process.stdout.write("\n");

        if (!result.data) {
            throw new Error("No audio data found in transaction.");
        }

        
        const buffer = Buffer.from(result.data, "base64");
        console.log(`Downloaded ${buffer.length} bytes.`);
        
        
        let ext = ".mp3";
        try {
            if (result.metadata) {
                const meta = JSON.parse(result.metadata);
                if (meta.filename) {
                     ext = path.extname(meta.filename) || ".mp3";
                } else if (meta.filetype) {
                    
                    if (meta.filetype.includes("m4a") || meta.filetype.includes("mp4")) ext = ".m4a";
                    if (meta.filetype.includes("wav")) ext = ".wav";
                    if (meta.filetype.includes("ogg")) ext = ".ogg";
                }
            }
        } catch (e) {
            console.warn("Failed to parse metadata for extension, defaulting to mp3");
        }

        
        const saneName = `iq_song_${audioTxId.slice(0, 8)}${ext}`;
        const filePath = path.join(downloadsDir, saneName);
        fs.writeFileSync(filePath, buffer);
        
        console.log(`Saved audio to: ${filePath}`);
        return filePath;
    }
}
