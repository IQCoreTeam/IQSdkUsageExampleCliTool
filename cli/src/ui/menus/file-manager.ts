import * as fs from "node:fs";
import path from "node:path";
import iqlabs from "iqlabs-sdk/src";


import {logError, logInfo, logTable} from "../../utils/logger";
import {prompt} from "../../utils/prompt";
import {chunkString, DEFAULT_CHUNK_SIZE} from "../../utils/chunk";
import {getWalletCtx} from "../../utils/wallet_manager";

const actionCodeIn= async (input:string,filename="test.txt") => {
    const {connection,signer} = getWalletCtx();
    logInfo("Chunking...");
    const chunks = chunkString(input, DEFAULT_CHUNK_SIZE);
    Buffer.byteLength(chunks[0], "utf8");

    logInfo(`Chunks: ${chunks.length}`);
    const lastDotIndex = filename.lastIndexOf(".");

    if (lastDotIndex === -1 || lastDotIndex === filename.length - 1) {
        throw new Error(
            "Filename must include an extension (e.g. example.txt, image.png)"
        );
    }
    const filetype = filename.slice(lastDotIndex + 1);

    logInfo("Uploading...");
    let lastPercent = -1;
    const handleProgress = (percent: number) => {
        if (percent === lastPercent) {
            return;
        }
        lastPercent = percent;
        if (process.stdout.isTTY) {
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(`Uploading... ${percent}%`);
            if (percent === 100) {
                process.stdout.write("\n");
            }
        } else {
            logInfo(`Uploading... ${percent}%`);
        }
    };

    const signature = await iqlabs.writer.codeIn(
        {connection, signer},
        chunks,
        undefined,
        filename,
        0,
        filetype,
        handleProgress,
    );

    logInfo(`Signature: ${signature}`);
    return signature;
}
const actionInscribeByTyping = async () => {
    const input = (await prompt("Text to inscribe: ")).trim();
    const filename = (await prompt("filename include the ext: (ex: file.txt)")).trim();
    if (!input) {
        logError("No text provided");
        return;
    }
    await actionCodeIn(input, filename);
};

const actionInscribeFromFile = async () => {
    const filePath = (await prompt("File path: ")).trim();
    if (!filePath || !fs.existsSync(filePath)) {
        logError("File not found");
        return;
    }

    const filename = path.basename(filePath);
    const input = fs.readFileSync(filePath, "utf8");

    try {
        await actionCodeIn(input,filename);
    } catch (err) {
        logError("Inscribe failed", err);
    }
};

// Action: Fetch specific inscription by signature
const actionFetchInscription = async () => {

    console.log("\n--- Fetch Inscription ---\n");
    const signature = (await prompt("Transaction signature: ")).trim();
    if (!signature) {
        logError("No signature provided");
        return;
    }
    try {
        logInfo("Reading...");
        let lastPercent = -1;
        const handleProgress = (percent: number) => {
            if (percent === lastPercent) {
                return;
            }
            lastPercent = percent;
            if (process.stdout.isTTY) {
                process.stdout.clearLine(0);
                process.stdout.cursorTo(0);
                process.stdout.write(`Reading... ${percent}%`);
                if (percent === 100) {
                    process.stdout.write("\n");
                }
            } else {
                logInfo(`Reading... ${percent}%`);
            }
        };
        const {data, metadata} = await iqlabs.reader.readCodeIn(
            signature,
            undefined,
            handleProgress,
        );
        logInfo(metadata);

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
    const {signer} = getWalletCtx();
    console.log("\n--- List Session Files ---\n");

    const userPubkey = signer.publicKey.toBase58();

    try {
        const sessions = await iqlabs.reader.getSessionPdaList(userPubkey);
        logTable(sessions.map((s) => ({PDA_ADDRESS: s})));
        ///TODO: If we dont mind of pda is become bit expensive, we might contain the transaction id of the user inventory code in in session pda
        // in new mode in session codein
        // we finalize that with user inventory code in (indexing to the wallet with metadata)
        // so that we can return with the filenames
    } catch (err) {
        logError("List sessions failed", err);
    }
};

// Action: List all files (linked list + session)
const actionListAllFiles = async () => {
    const {signer} = getWalletCtx();
    console.log("\n--- List All Files ---\n");

    const limitInput = (await prompt("Limit [10]: ")).trim();
    const limit = parseInt(limitInput) || 10;

    const before = (await prompt("Before signature (optional): ")).trim() || undefined;
    try {
        const signatures = await iqlabs.reader.fetchInventoryTransactions(signer.publicKey, limit, before);
        if (signatures.length === 0) {
            logInfo("No transactions found");
        } else {
            logTable(
                signatures.map((sig) => ({
                    signature: sig.signature,
                    err: sig.err ? "error" : "ok",
                    memo: sig.memo ?? "",
                    onChainPath: sig.onChainPath ?? "",
                    metadata: sig.metadata ?? "",
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
        console.clear();
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
        console.clear();
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
        console.clear();
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
