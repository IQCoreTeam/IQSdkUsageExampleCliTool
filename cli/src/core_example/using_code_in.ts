import { Connection, Keypair } from "@solana/web3.js";
import * as sdkModule from "iqlabs-sdk/src/sdk";

import { logError, logInfo } from "../utils/logger";
import { chunkString, DEFAULT_CHUNK_SIZE } from "../utils/chunk";

type ModuleLike = { default?: Record<string, unknown>; [key: string]: unknown };
const resolveExports = (m: ModuleLike) =>
    m.default && typeof m.default === "object" ? { ...m.default, ...m } : m;

const sdk = resolveExports(sdkModule as ModuleLike); //??
const writer = sdk.writer as typeof sdkModule.writer;

export const codeInFromInput = async (
    connection: Connection,
    signer: Keypair,
    input: string,
    filename?: string,
    filetype?: string,
) => {
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
