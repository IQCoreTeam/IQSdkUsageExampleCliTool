import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { Connection, Keypair } from "@solana/web3.js";

import * as sdkModule from "iqlabs-sdk/src/sdk";

import { logInfo, logError, logTable } from "../../utils/logger";
import { chunkString, DEFAULT_CHUNK_SIZE } from "../../utils/chunk";
import { prompt } from "../../utils/prompt";

// SDK setup
type ModuleLike = { default?: Record<string, unknown>; [key: string]: unknown };
const resolveExports = (m: ModuleLike) =>
    m.default && typeof m.default === "object" ? { ...m.default, ...m } : m;

const sdk = resolveExports(sdkModule as ModuleLike);

const reader = sdk.reader as typeof sdkModule.reader;
const writer = sdk.writer as typeof sdkModule.writer;

// Config - use env var or default
const DEFAULT_RPC = process.env.SOLANA_RPC_ENDPOINT || "https://api.devnet.solana.com";

// Check for local keypair.json first, then env var, then default solana cli keypair
const findKeypair = (): string => {
    const localKeypair = path.join(process.cwd(), "keypair.json");
    if (fs.existsSync(localKeypair)) return localKeypair;
    if (process.env.SOLANA_KEYPAIR_PATH) return process.env.SOLANA_KEYPAIR_PATH;
    return path.join(os.homedir(), ".config/solana/id.json");
};
const DEFAULT_KEYPAIR = findKeypair();

const clearScreen = () => console.clear();

// Keypair loader
const loadKeypair = (keypairPath: string): Keypair => {
    const resolvedPath = keypairPath.startsWith("~")
        ? path.join(os.homedir(), keypairPath.slice(1))
        : keypairPath;
    const secretKey = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
    return Keypair.fromSecretKey(new Uint8Array(secretKey));
};

// File Manager context
type FileManagerContext = {
    connection: Connection;
    signer: Keypair;
    rpc: string;
};

let ctx: FileManagerContext | null = null;

// Initialize context (uses defaults automatically)
const initContext = (): FileManagerContext => {
    if (ctx) return ctx;

    const connection = new Connection(DEFAULT_RPC, "confirmed");
    const signer = loadKeypair(DEFAULT_KEYPAIR);

    process.env.SOLANA_RPC_ENDPOINT = DEFAULT_RPC;

    logInfo(`RPC: ${DEFAULT_RPC}`);
    logInfo(`Signer: ${signer.publicKey.toBase58()}`);

    ctx = { connection, signer, rpc: DEFAULT_RPC };
    return ctx;
};

// Action: Inscribe file or string
const actionInscribe = async () => {
    const { connection, signer } = initContext();

    console.log("\n--- Inscribe ---\n");
    console.log("  1) File");
    console.log("  2) Text");
    console.log("");

    const choice = (await prompt("Select input type: ")).trim();

    let input: string;
    if (choice === "1") {
        const filePath = (await prompt("File path: ")).trim();
        if (!filePath || !fs.existsSync(filePath)) {
            logError("File not found");
            return;
        }
        input = fs.readFileSync(filePath, "utf8");
    } else if (choice === "2") {
        input = (await prompt("Text to inscribe: ")).trim();
        if (!input) {
            logError("No text provided");
            return;
        }
    } else {
        logError("Invalid option");
        return;
    }

    const filename = (await prompt("Filename (optional): ")).trim() || undefined;
    const filetype = (await prompt("Filetype (optional): ")).trim() || undefined;

    try {
        logInfo("Chunking...");
        const chunks = chunkString(input, DEFAULT_CHUNK_SIZE);
        logInfo(`Chunks: ${chunks.length}`);

        logInfo("Uploading...");
        const signature = await writer.codein(
            { connection, signer },
            chunks,
            false,
            filename,
            0,
            filetype ?? "",
        );

        logInfo(`Signature: ${signature}`);
    } catch (err) {
        logError("Inscribe failed", err);
    }
};

// Action: Fetch specific inscription by signature
const actionFetchInscription = async () => {
    initContext();

    console.log("\n--- Fetch Inscription ---\n");

    const signature = (await prompt("Transaction signature: ")).trim();
    if (!signature) {
        logError("No signature provided");
        return;
    }

    try {
        logInfo("Reading metadata...");
        const metadata = await reader.readDBMetadata(signature);
        logInfo(`Path: ${metadata.onChainPath}`);
        logInfo(`Metadata: ${metadata.metadata}`);

        logInfo("Reading content...");
        const { data } = await reader.readCodeIn(signature);
        if (data === null) {
            logInfo("Content unavailable (replay requested)");
        } else {
            console.log("\n--- Content ---");
            console.log(data.length > 500 ? data.slice(0, 500) + "...[truncated]" : data);
            console.log("--- End ---\n");
        }
    } catch (err) {
        logError("Read failed", err);
    }
};

// Action: List session files (large files only)
const actionListSessionFiles = async () => {
    const { signer } = initContext();

    console.log("\n--- List Session Files ---\n");

    const pubkeyInput = (await prompt(`User pubkey [${signer.publicKey.toBase58()}]: `)).trim();
    const userPubkey = pubkeyInput || signer.publicKey.toBase58();

    try {
        logInfo(`Fetching sessions for: ${userPubkey}`);
        const sessions = await reader.getSessionPdaList(userPubkey);

        if (sessions.length === 0) {
            logInfo("No sessions found");
        } else {
            logTable(sessions.map((s: string) => ({ session: s })));
        }
    } catch (err) {
        logError("List sessions failed", err);
    }
};

// Action: List all files (linked list + session)
const actionListAllFiles = async () => {
    initContext();

    console.log("\n--- List All Files ---\n");

    const pdaInput = (await prompt("DB PDA address: ")).trim();
    if (!pdaInput) {
        logError("No PDA provided");
        return;
    }

    const limitInput = (await prompt("Limit [10]: ")).trim();
    const limit = parseInt(limitInput) || 10;

    const before = (await prompt("Before signature (optional): ")).trim() || undefined;

    try {
        logInfo(`Fetching transactions for: ${pdaInput}`);
        const signatures = await reader.fetchAccountTransactions(pdaInput, { limit, before });

        if (signatures.length === 0) {
            logInfo("No transactions found");
        } else {
            logTable(signatures.map((sig) => ({
                signature: sig.signature,
                slot: sig.slot,
                err: sig.err ? "error" : "ok",
                memo: sig.memo ?? "",
            })));
        }
    } catch (err) {
        logError("Fetch transactions failed", err);
    }
};

// Menu
const showMenu = () => {
    console.log("\n============================");
    console.log("       File Manager         ");
    console.log("============================\n");
    console.log("  1) Inscribe file/string");
    console.log("  2) Fetch inscription by signature");
    console.log("  3) List session files");
    console.log("  4) List all files");
    console.log("  5) Back");
    console.log("\n============================\n");
};

// Main loop
export const runFileManager = async (): Promise<void> => {
    let running = true;

    while (running) {
        clearScreen();
        showMenu();

        const choice = (await prompt("Select option: ")).trim();

        switch (choice) {
            case "1":
                await actionInscribe();
                await prompt("\nPress Enter to continue...");
                break;
            case "2":
                await actionFetchInscription();
                await prompt("\nPress Enter to continue...");
                break;
            case "3":
                await actionListSessionFiles();
                await prompt("\nPress Enter to continue...");
                break;
            case "4":
                await actionListAllFiles();
                await prompt("\nPress Enter to continue...");
                break;
            case "5":
                running = false;
                break;
            default:
                logError("Invalid option");
                await prompt("\nPress Enter to continue...");
        }
    }
};
