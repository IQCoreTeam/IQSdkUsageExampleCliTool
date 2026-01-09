import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { Connection, Keypair } from "@solana/web3.js";

import * as sdkModule from "iqlabs-sdk/src/sdk";

import { logError, logInfo, logTable } from "../../utils/logger";
import { codeInFromInput } from "../../core_example/using_code_in";
import { prompt } from "../../utils/prompt";

// SDK setup
type ModuleLike = { default?: Record<string, unknown>; [key: string]: unknown };
const resolveExports = (m: ModuleLike) =>
    m.default && typeof m.default === "object" ? { ...m.default, ...m } : m;

const sdk = resolveExports(sdkModule as ModuleLike);

const reader = sdk.reader as typeof sdkModule.reader;

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

const actionInscribeByTyping = async () => {
    const input = (await prompt("Text to inscribe: ")).trim();
    if (!input) {
        logError("No text provided");
        return;
    }
    const { connection, signer } = initContext();
    await codeInFromInput(connection, signer, input, "typed-text.txt", "text/plain");
};

const actionInscribeFromFile = async () => {
    const filePath = (await prompt("File path: ")).trim();
    if (!filePath || !fs.existsSync(filePath)) {
        logError("File not found");
        return;
    }

    const input = fs.readFileSync(filePath, "utf8");
    const { connection, signer } = initContext();
    await codeInFromInput(connection, signer, input, path.basename(filePath));
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
            console.log(
                data.length > 500 ? data.slice(0, 500) + "...[truncated]" : data,
            );
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
            logTable(
                signatures.map((sig) => ({
                    signature: sig.signature,
                    slot: sig.slot,
                    err: sig.err ? "error" : "ok",
                    memo: sig.memo ?? "",
                })),
            );
        }
    } catch (err) {
        logError("Fetch transactions failed", err);
    }
};

const showMainMenu = () => {
    console.log("\n============================");
    console.log("       File Manager         ");
    console.log("============================\n");
    console.log("  1) Read");
    console.log("  2) Write");
    console.log("  3) Back");
    console.log("\n============================\n");
};

const showReadMenu = () => {
    console.log("\n============================");
    console.log("          Read Menu          ");
    console.log("============================\n");
    console.log("  1) Fetch inscription by signature");
    console.log("  2) List session files");
    console.log("  3) List all files");
    console.log("  4) Back");
    console.log("\n============================\n");
};

const showWriteMenu = () => {
    console.log("\n============================");
    console.log("          Write Menu         ");
    console.log("============================\n");
    console.log("  1) Typing");
    console.log("  2) File path");
    console.log("  3) Back");
    console.log("\n============================\n");
};

const runReadMenu = async (): Promise<void> => {
    let readRunning = true;
    while (readRunning) {
        clearScreen();
        showReadMenu();

        const choice = (await prompt("Select option [read]: ")).trim();
        switch (choice) {
            case "1":
                await actionFetchInscription();
                await prompt("\nPress Enter to continue...");
                break;
            case "2":
                await actionListSessionFiles();
                await prompt("\nPress Enter to continue...");
                break;
            case "3":
                await actionListAllFiles();
                await prompt("\nPress Enter to continue...");
                break;
            case "4":
                readRunning = false;
                break;
            default:
                logError("Invalid option");
                await prompt("\nPress Enter to continue...");
        }
    }
};

const runWriteMenu = async (): Promise<void> => {
    let writeRunning = true;
    while (writeRunning) {
        clearScreen();
        showWriteMenu();

        const choice = (await prompt("Select option [write]: ")).trim();
        switch (choice) {
            case "1":
                await actionInscribeByTyping();
                await prompt("\nPress Enter to continue...");
                break;
            case "2":
                await actionInscribeFromFile();
                await prompt("\nPress Enter to continue...");
                break;
            case "3":
                writeRunning = false;
                break;
            default:
                logError("Invalid option");
                await prompt("\nPress Enter to continue...");
        }
    }
};

// Main loop
export const runFileManager = async (): Promise<void> => {
    let running = true;

    while (running) {
        clearScreen();
        showMainMenu();

        const choice = (await prompt("Select option: ")).trim();
        switch (choice) {
            case "1":
                await runReadMenu();
                break;
            case "2":
                await runWriteMenu();
                break;
            case "3":
                running = false;
                break;
            default:
                logError("Invalid option");
                await prompt("\nPress Enter to continue...");
        }
    }
};
