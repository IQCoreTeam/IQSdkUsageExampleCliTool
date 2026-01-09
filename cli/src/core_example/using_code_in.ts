import { Connection, Keypair } from "@solana/web3.js";
import * as sdkModule from "iqlabs-sdk";

import { logError, logInfo } from "../utils/logger";
import { chunkString, DEFAULT_CHUNK_SIZE } from "../utils/chunk";

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
        const signature = await sdkModule.writer.codein(
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
