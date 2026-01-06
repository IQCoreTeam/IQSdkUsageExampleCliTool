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

// Config - use env vars or defaults
const DEFAULT_RPC = process.env.IQLABS_RPC_ENDPOINT
    || process.env.SOLANA_RPC_ENDPOINT
    || "https://devnet.helius-rpc.com/?api-key=54b2d536-e4d8-4ccf-814e-0c38e242cd74";

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

    process.env.IQLABS_RPC_ENDPOINT = DEFAULT_RPC;

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

// Action: Read inscription by signature
const actionRead = async () => {
    initContext();

    console.log("\n--- Read Inscription ---\n");

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
        const { result } = await reader.readInscription(signature);
        if (result === null) {
            logInfo("Content unavailable (replay requested)");
        } else {
            console.log("\n--- Content ---");
            console.log(result.length > 500 ? result.slice(0, 500) + "...[truncated]" : result);
            console.log("--- End ---\n");
        }
    } catch (err) {
        logError("Read failed", err);
    }
};

// Action: List session PDAs
const actionListSessions = async () => {
    const { signer } = initContext();

    console.log("\n--- List Session PDAs ---\n");

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

// Action: Fetch DB transactions (by PDA)
const actionFetchTransactions = async () => {
    initContext();

    console.log("\n--- Fetch DB Transactions ---\n");

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
                signature: sig.signature.slice(0, 20) + "...",
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
    console.log("  2) Read inscription by signature");
    console.log("  3) List my session PDAs");
    console.log("  4) Fetch DB transactions (by PDA)");
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
                await actionRead();
                await prompt("\nPress Enter to continue...");
                break;
            case "3":
                await actionListSessions();
                await prompt("\nPress Enter to continue...");
                break;
            case "4":
                await actionFetchTransactions();
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
