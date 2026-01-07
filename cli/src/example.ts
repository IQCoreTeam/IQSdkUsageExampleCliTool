import {randomUUID} from "node:crypto";
import {readFileSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import os from "node:os";
import {BorshAccountsCoder, type Idl} from "@coral-xyz/anchor";
import BN from "bn.js";
import {
    Connection,
    Keypair,
    LAMPORTS_PER_SOL,
    PublicKey,
    SystemProgram,
} from "@solana/web3.js";

import * as sdkModule from "iqlabs-sdk/src/sdk";
import * as constantsModule from "iqlabs-sdk/src/contract/constants";
import * as contractModule from "iqlabs-sdk/src/contract";
import * as writerUtilsModule from "iqlabs-sdk/src/sdk/writer/writer_utils";
import * as seedUtilsModule from "iqlabs-sdk/src/sdk/utils/seed";

const DEFAULT_RPC = process.env.SOLANA_RPC_ENDPOINT || "https://api.devnet.solana.com";
const DEFAULT_CHUNK_SIZE = 700;
const DEFAULT_READ_DELAY_MS = 2000;

type ReadSpeed = "light" | "normal" | "fast";
const DEFAULT_SPEED: ReadSpeed = "light";
const DEFAULT_AIRDROP_LAMPORTS = Math.round(0.2 * LAMPORTS_PER_SOL);

type Runtime = "pinocchio" | "anchor";

type ModuleLike = {
    default?: Record<string, unknown>;
    [key: string]: unknown;
};

const resolveExports = (moduleLike: ModuleLike) => {
    if (moduleLike.default && typeof moduleLike.default === "object") {
        return {...moduleLike.default, ...moduleLike};
    }
    return moduleLike;
};

const sdk = resolveExports(sdkModule as ModuleLike);
const constants = resolveExports(constantsModule as ModuleLike);
const contract = resolveExports(contractModule as ModuleLike) as typeof contractModule;
const writerUtils = resolveExports(writerUtilsModule as ModuleLike) as typeof writerUtilsModule;
const seedUtils = resolveExports(seedUtilsModule as ModuleLike) as typeof seedUtilsModule;

const {
    createAnchorProfile,
    createInstructionBuilder,
    createPinocchioProfile,
    createSessionInstruction,
    createTableInstruction,
    dbCodeInInstruction,
    getCodeAccountPda,
    getConnectionInstructionTablePda,
    getConnectionTablePda,
    getConnectionTableRefPda,
    getDbAccountPda,
    getDbRootPda,
    getInstructionTablePda,
    getSessionPda,
    getTablePda,
    getTableRefPda,
    getTargetConnectionTableRefPda,
    getTargetTableRefPda,
    getUserPda,
    initializeDbRootInstruction,
    manageConnectionInstruction,
    requestConnectionInstruction,
    sendCodeInstruction,
    updateDbRootTableListInstruction,
    updateTableInstruction,
    updateUserMetadataInstruction,
    writeConnectionDataInstruction,
    writeDataInstruction,
} = contract;
const {ensureUserInitialized, sendTx} = writerUtils;
const {deriveDmSeed, deriveSeedBytes} = seedUtils;

const reader = sdk.reader as typeof sdkModule.reader;
const writer = sdk.writer as typeof sdkModule.writer;
const DEFAULT_LINKED_LIST_THRESHOLD = sdk
    .DEFAULT_LINKED_LIST_THRESHOLD as number;
const DEFAULT_WRITE_FEE_RECEIVER = sdk.DEFAULT_WRITE_FEE_RECEIVER as string;
const DEFAULT_WRITE_FEE_LAMPORTS = sdk.DEFAULT_WRITE_FEE_LAMPORTS as number;
const DEFAULT_ANCHOR_PROGRAM_ID = constants
    .DEFAULT_ANCHOR_PROGRAM_ID as string;
const DEFAULT_PINOCCHIO_PROGRAM_ID = constants
    .DEFAULT_PINOCCHIO_PROGRAM_ID as string;
const CONNECTION_STATUS_APPROVED = constants
    .CONNECTION_STATUS_APPROVED as number;

if (!reader || !writer || !DEFAULT_LINKED_LIST_THRESHOLD) {
    throw new Error("Failed to load SDK exports from iqlabs-sdk.");
}
if (!DEFAULT_ANCHOR_PROGRAM_ID || !DEFAULT_PINOCCHIO_PROGRAM_ID) {
    throw new Error("Failed to load program IDs from iqlabs-sdk.");
}
if (!DEFAULT_WRITE_FEE_RECEIVER) {
    throw new Error("Failed to load DEFAULT_WRITE_FEE_RECEIVER from iqlabs-sdk.");
}
if (!DEFAULT_WRITE_FEE_LAMPORTS) {
    throw new Error("Failed to load DEFAULT_WRITE_FEE_LAMPORTS from iqlabs-sdk.");
}

const usage = `\
Usage:
  npm run dev -- <command> [options]

Commands:
  upload-session   Upload chunks, finalize with db_code_in, print signature
  read-session     Read an inscription from its db_code_in signature
  roundtrip        Upload then read back and compare
  linked-list-codein  Linked-list db_code_in test (standalone)
  instruction-suite  Run instruction-family smoke test (codein, iqdb, connection, user)

Options:
  --rpc <url>              RPC endpoint (default: ${DEFAULT_RPC})
  --keypair <path>         Keypair path (default: ~/.config/solana/id.json)
  --runtime <pinocchio|anchor>  Target program (default: pinocchio)
  --text <string>          Text payload to upload
  --file <path>            File payload to upload
  --base64                 Treat payload as base64 (file -> encode, read -> decode)
  --filename <name>        Optional filename stored in metadata
  --method <n>             Optional method value stored in metadata
  --filetype <type>        Optional filetype stored in metadata
  --chunk-size <n>          Chunk size in characters (default: ${DEFAULT_CHUNK_SIZE})
  --force-session          Require session upload (>=${DEFAULT_LINKED_LIST_THRESHOLD} chunks)
  --repeat <n>             Repeat text payload n times
  --signature <sig>        db_code_in transaction signature
  --speed <light|medium|heavy|extreme>  Session read speed profile (default: ${DEFAULT_SPEED})
  --max-rps <n>            Override read requests per second
  --max-concurrency <n>    Override read concurrency
  --upload-concurrency <n> Parallel uploads for session chunks (default: chunk count)
  --upload-rps <n>         Throttle session chunk uploads (requests/sec)
  --session-readonly       Force session as read-only (pinocchio default: true)
  --receiver-keypair <path>  Connection test receiver keypair (defaults to generated)
  --output <path>          Write read result to a file
  --read-delay <ms>        Delay before read in roundtrip (default: ${DEFAULT_READ_DELAY_MS})
  --no-log-tx              Disable SDK transaction logging
  --help                   Show help
`;

type FlagValue = string | boolean;

type ParsedArgs = {
    command: string | null;
    flags: Record<string, FlagValue>;
    positionals: string[];
};

const toNumber = (value: FlagValue | undefined) => {
    if (typeof value !== "string") {
        return null;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return null;
    }
    return parsed;
};

const toString = (value: FlagValue | undefined) =>
    typeof value === "string" ? value : null;

const toBool = (value: FlagValue | undefined) => Boolean(value);

const normalizeRuntime = (runtime: string | null): Runtime => {
    if (!runtime) {
        return "pinocchio";
    }
    const normalized = runtime.toLowerCase();
    if (normalized !== "anchor" && normalized !== "pinocchio") {
        throw new Error(`Unknown runtime: ${runtime}`);
    }
    return normalized;
};

const parseArgs = (argv: string[]): ParsedArgs => {
    const flags: Record<string, FlagValue> = {};
    const positionals: string[] = [];
    let command: string | null = null;

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (!command && !arg.startsWith("-")) {
            command = arg;
            continue;
        }
        if (arg.startsWith("--")) {
            const trimmed = arg.slice(2);
            if (trimmed.length === 0) {
                continue;
            }
            const eqIndex = trimmed.indexOf("=");
            if (eqIndex >= 0) {
                const key = trimmed.slice(0, eqIndex);
                const value = trimmed.slice(eqIndex + 1);
                flags[key] = value;
                continue;
            }
            const next = argv[i + 1];
            if (next && !next.startsWith("-")) {
                flags[trimmed] = next;
                i += 1;
            } else {
                flags[trimmed] = true;
            }
            continue;
        }
        if (arg === "-h" || arg === "-H") {
            flags.help = true;
            continue;
        }
        positionals.push(arg);
    }

    return {command, flags, positionals};
};

const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

const logStep = (label: string) => {
    console.log(`>> ${label}`);
};

const retry = async <T>(
    fn: () => Promise<T>,
    options: {attempts: number; delayMs: number},
): Promise<T> => {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt < options.attempts) {
                await sleep(options.delayMs);
            }
        }
    }
    throw lastError;
};

const defaultKeypairPath = () =>
    path.join(os.homedir(), ".config", "solana", "id.json");

const require = createRequire(import.meta.url);
const loadIdl = () => {
    const idlPath = require.resolve("iqlabs-sdk/idl/code_in.json");
    const data = readFileSync(idlPath, "utf8");
    return JSON.parse(data) as unknown;
};

const loadKeypair = (keypairPath: string): Keypair => {
    const raw = readFileSync(keypairPath, "utf8");
    const secret = JSON.parse(raw) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(secret));
};

type PayloadInfo = {
    payload: string;
    label: string;
    base64: boolean;
    rawBytes: Buffer | null;
};

const resolvePayload = (flags: Record<string, FlagValue>): PayloadInfo => {
    const text = toString(flags.text);
    const file = toString(flags.file);
    const useBase64 = toBool(flags.base64);
    const repeat = toNumber(flags.repeat) ?? 1;

    if (!text && !file) {
        throw new Error("Provide --text or --file for upload.");
    }
    if (text && file) {
        throw new Error("Use only one of --text or --file.");
    }

    if (text) {
        const payload = text.repeat(Math.max(1, Math.floor(repeat)));
        return {payload, label: "text", base64: useBase64, rawBytes: null};
    }

    const filePath = file as string;
    const data = readFileSync(filePath);
    const payload = useBase64 ? data.toString("base64") : data.toString("utf8");
    return {payload, label: filePath, base64: useBase64, rawBytes: data};
};

const chunkString = (value: string, size: number) => {
    if (size <= 0) {
        throw new Error("chunk size must be > 0");
    }
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += size) {
        chunks.push(value.slice(i, i + size));
    }
    return chunks;
};

const resolveRuntimeProgramId = (runtime: string | null) => {
    const normalized = normalizeRuntime(runtime);
    if (normalized === "pinocchio") {
        return new PublicKey(DEFAULT_PINOCCHIO_PROGRAM_ID);
    }
    return new PublicKey(DEFAULT_ANCHOR_PROGRAM_ID);
};

const resolveRuntimeConfig = (runtime: string | null) => {
    const normalized = normalizeRuntime(runtime);
    const programId =
        normalized === "pinocchio"
            ? new PublicKey(DEFAULT_PINOCCHIO_PROGRAM_ID)
            : new PublicKey(DEFAULT_ANCHOR_PROGRAM_ID);
    const profile =
        normalized === "pinocchio"
            ? createPinocchioProfile(programId)
            : createAnchorProfile(programId);
    return {runtime: normalized, programId, profile};
};

const resolveReadSpeed = (flags: Record<string, FlagValue>): ReadSpeed => {
    const speedValue = toString(flags.speed);
    const normalized = speedValue ? speedValue.toLowerCase() : null;
    return normalized === "medium" ||
        normalized === "heavy" ||
        normalized === "extreme" ||
        normalized === "light"
        ? (normalized as ReadSpeed)
        : DEFAULT_SPEED;
};

const resolveChunks = (
    payload: string,
    flags: Record<string, FlagValue>,
): {chunks: string[]; chunkSize: number} => {
    const forceSession = toBool(flags["force-session"]);
    const minChunks = forceSession ? DEFAULT_LINKED_LIST_THRESHOLD : null;
    let chunkSize = toNumber(flags["chunk-size"]) ?? DEFAULT_CHUNK_SIZE;

    if (minChunks) {
        const idealSize = Math.max(1, Math.floor(payload.length / minChunks));
        chunkSize = Math.min(chunkSize, idealSize);
    }

    const chunks = chunkString(payload, chunkSize);
    if (minChunks && chunks.length < minChunks) {
        throw new Error(
            `Payload too small for session upload. Got ${chunks.length} chunks; ` +
                `need >= ${minChunks}. Try --repeat or a smaller --chunk-size.`,
        );
    }

    return {chunks, chunkSize};
};

const toHex = (value: Uint8Array) => Buffer.from(value).toString("hex");

const buildSessionChunks = (payload: string) => {
    const chunkSize = Math.max(
        1,
        Math.floor(payload.length / DEFAULT_LINKED_LIST_THRESHOLD),
    );
    const chunks = chunkString(payload, chunkSize);
    if (chunks.length < DEFAULT_LINKED_LIST_THRESHOLD) {
        throw new Error(
            `payload too small for session chunks (got ${chunks.length})`,
        );
    }
    return chunks;
};

const toSeed28 = (value: Uint8Array) =>
    value.length > 28 ? value.slice(0, 28) : value;
const toSeedArg = (value: Uint8Array) => Buffer.from(value);

const resolvePayloadOrDefault = (flags: Record<string, FlagValue>): PayloadInfo => {
    const text = toString(flags.text);
    const file = toString(flags.file);
    if (!text && !file) {
        return {
            payload: "hello linked list",
            label: "default",
            base64: false,
            rawBytes: null,
        };
    }
    return resolvePayload(flags);
};

const fundReceiverIfNeeded = async (
    connection: Connection,
    signer: Keypair,
    receiver: PublicKey,
    minLamports: number,
) => {
    const balance = await connection.getBalance(receiver);
    if (balance >= minLamports) {
        return balance;
    }
    const transferIx = SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: receiver,
        lamports: minLamports - balance,
    });
    await sendTx(connection, signer, transferIx);
    return connection.getBalance(receiver);
};

const linkedListCodeIn = async (flags: Record<string, FlagValue>) => {
    const rpc = toString(flags.rpc) ?? DEFAULT_RPC;
    process.env.SOLANA_RPC_ENDPOINT = rpc;

    const keypairPath = toString(flags.keypair) ?? defaultKeypairPath();
    const {runtime, programId, profile} = resolveRuntimeConfig(
        toString(flags.runtime),
    );
    const idl = loadIdl() as Idl;
    const builder = createInstructionBuilder(idl, profile.programId);

    const {payload, label, base64} = resolvePayloadOrDefault(flags);
    const chunkSize =
        toNumber(flags["chunk-size"]) ?? Math.max(1, payload.length);
    const chunks = chunkString(payload, chunkSize);
    if (chunks.length >= DEFAULT_LINKED_LIST_THRESHOLD) {
        throw new Error(
            `Payload too large for linked-list test. ` +
                `Got ${chunks.length} chunks; need < ${DEFAULT_LINKED_LIST_THRESHOLD}.`,
        );
    }

    const connection = new Connection(rpc, "confirmed");
    const signer = loadKeypair(keypairPath);
    const userState = getUserPda(profile, signer.publicKey);

    console.log(`Using RPC: ${rpc}`);
    console.log(`Runtime: ${runtime}`);
    console.log(`Program ID: ${programId.toBase58()}`);
    console.log(`Signer: ${signer.publicKey.toBase58()}`);
    console.log(`Payload source: ${label}`);
    console.log(`Chunk size: ${chunkSize} chars, total chunks: ${chunks.length}`);

    logStep("User initialize");
    await ensureUserInitialized(connection, signer, builder, {
        user: signer.publicKey,
        code_account: getCodeAccountPda(profile, signer.publicKey),
        user_state: userState,
        db_account: getDbAccountPda(profile, signer.publicKey),
        system_program: SystemProgram.programId,
    });

    let sessionAccount: PublicKey | undefined = undefined;
    if (runtime === "anchor") {
        const info = await connection.getAccountInfo(userState);
        if (!info) {
            throw new Error("user_state not found");
        }
        const accountCoder = new BorshAccountsCoder(idl);
        const decoded = accountCoder.decode("UserState", info.data) as {
            total_session_files: BN;
        };
        const seq = BigInt(decoded.total_session_files.toString());
        const session = getSessionPda(profile, signer.publicKey, seq);
        const createIx = createSessionInstruction(
            builder,
            {
                user: signer.publicKey,
                user_state: userState,
                session,
                system_program: SystemProgram.programId,
            },
            {seq: new BN(seq.toString())},
        );
        logStep("Create dummy session (anchor)");
        await sendTx(connection, signer, createIx);
        sessionAccount = session;
    }

    logStep("Send code chunks");
    let beforeTx = "Genesis";
    for (let index = 0; index < chunks.length; index += 1) {
        const ix = sendCodeInstruction(
            builder,
            {
                user: signer.publicKey,
                code_account: getCodeAccountPda(profile, signer.publicKey),
                system_program: SystemProgram.programId,
            },
            {
                code: chunks[index],
                before_tx: beforeTx,
                method: toNumber(flags.method) ?? 0,
                decode_break: 0,
            },
        );
        beforeTx = await sendTx(connection, signer, ix);
    }

    const metadata = JSON.stringify({
        filetype:
            toString(flags.filetype) ??
            (base64 ? "application/octet-stream" : "text/plain"),
        method: toNumber(flags.method) ?? 0,
        filename: toString(flags.filename) ?? "linked_list.txt",
        total_chunks: chunks.length,
    });
    const dbAccount = getDbAccountPda(profile, signer.publicKey);
    const feeReceiver = new PublicKey(DEFAULT_WRITE_FEE_RECEIVER);

    logStep("Finalize db_code_in");
    const feeIx = SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: dbAccount,
        lamports: DEFAULT_WRITE_FEE_LAMPORTS,
    });
    const dbIx = dbCodeInInstruction(
        builder,
        {
            user: signer.publicKey,
            db_account: dbAccount,
            system_program: SystemProgram.programId,
            session: sessionAccount,
        },
        {on_chain_path: beforeTx, metadata, session: null},
    );
    dbIx.keys.push({
        pubkey: feeReceiver,
        isSigner: false,
        isWritable: true,
    });
    const signature = await sendTx(connection, signer, [feeIx, dbIx]);

    logStep("Fetching db_code_in metadata");
    const metadataResult = await retry(
        () => reader.readDBMetadata(signature),
        {attempts: 10, delayMs: 2000},
    );
    console.log(`onChainPath: ${metadataResult.onChainPath}`);
    console.log(`metadata: ${metadataResult.metadata}`);

    logStep("Reading inscription");
    const readSpeed = resolveReadSpeed(flags);
    const {result} = await retry(
        () => reader.readInscription(signature, readSpeed),
        {attempts: 10, delayMs: 2000},
    );
    if (result === null) {
        throw new Error("Read returned null; replay was requested.");
    }

    if (base64) {
        const original = Buffer.from(payload, "base64");
        const decoded = Buffer.from(result, "base64");
        if (!original.equals(decoded)) {
            throw new Error("Linked-list mismatch (base64 decoded content differs).");
        }
        console.log("Linked-list match (base64).");
    } else if (result !== payload) {
        throw new Error("Linked-list mismatch (text differs).");
    } else {
        console.log("Linked-list match (text).");
    }
};

const uploadSession = async (flags: Record<string, FlagValue>) => {
    const rpc = toString(flags.rpc) ?? DEFAULT_RPC;
    process.env.SOLANA_RPC_ENDPOINT = rpc;

    const keypairPath = toString(flags.keypair) ?? defaultKeypairPath();
    const runtime = normalizeRuntime(toString(flags.runtime));
    const {payload, label, base64, rawBytes} = resolvePayload(flags);
    const {chunks, chunkSize} = resolveChunks(payload, flags);
    const uploadConcurrency =
        toNumber(flags["upload-concurrency"]) ??
        Math.min(64, Math.max(1, chunks.length));
    const uploadRps = toNumber(flags["upload-rps"]) ?? undefined;

    const connection = new Connection(rpc, "confirmed");
    const signer = loadKeypair(keypairPath);
    const programId = resolveRuntimeProgramId(runtime);

    console.log(`Using RPC: ${rpc}`);
    console.log(`Signer: ${signer.publicKey.toBase58()}`);
    console.log(`Runtime: ${runtime}`);
    console.log(`Program ID: ${programId.toBase58()}`);
    console.log(`Payload source: ${label}`);
    console.log(`Chunk size: ${chunkSize} chars, total chunks: ${chunks.length}`);
    console.log(`Upload mode: ${chunks.length < DEFAULT_LINKED_LIST_THRESHOLD ? "linked_list" : "session"}`);
    console.log(`Upload concurrency: ${uploadConcurrency}`);
    if (uploadRps) {
        console.log(`Upload RPS limit: ${uploadRps}`);
    }
    const sessionReadOnlyOverride = flags["session-readonly"] ? true : undefined;
    if (runtime === "pinocchio") {
        console.log(
            `Session read-only: ${sessionReadOnlyOverride ?? true}`,
        );
    }

    const uploadSpeed = toString(flags.speed) ?? DEFAULT_SPEED;
    logStep("Starting upload (create session, post chunks, db_code_in)");
    const txSignature = await writer.codein(
        {connection, signer},
        chunks,
        runtime === "anchor",
        toString(flags.filename) ?? undefined,
        toNumber(flags.method) ?? 0,
        toString(flags.filetype) ?? "",
        uploadSpeed,
    );

    logStep("Upload completed");
    console.log(`db_code_in signature: ${txSignature}`);

    logStep("Fetching db_code_in metadata");
    const metadata = await retry(
        () => reader.readDBMetadata(txSignature),
        {attempts: 10, delayMs: 2000},
    );

    logStep("Metadata fetched");
    console.log(`onChainPath: ${metadata.onChainPath}`);
    console.log(`metadata: ${metadata.metadata}`);

    return {txSignature, payload, base64, rawBytes};
};

const readSession = async (flags: Record<string, FlagValue>) => {
    const rpc = toString(flags.rpc) ?? DEFAULT_RPC;
    process.env.SOLANA_RPC_ENDPOINT = rpc;

    const signature =
        toString(flags.signature) ??
        (flags["sig"] ? String(flags["sig"]) : null);
    if (!signature) {
        throw new Error("Provide --signature for read-session.");
    }

    console.log(`Using RPC: ${rpc}`);
    console.log(`Signature: ${signature}`);

    const readSpeed = resolveReadSpeed(flags);

    logStep("Fetching db_code_in metadata");
    const metadata = await retry(
        () => reader.readDBMetadata(signature),
        {attempts: 10, delayMs: 2000},
    );
    logStep("Metadata fetched");
    console.log(`onChainPath: ${metadata.onChainPath}`);
    console.log(`metadata: ${metadata.metadata}`);

    logStep("Reading inscription");
    const {result} = await retry(
        () => reader.readInscription(signature, readSpeed),
        {attempts: 10, delayMs: 2000},
    );

    if (result === null) {
        console.log("Result unavailable; replay was requested.");
        return {result: null as string | null};
    }

    logStep("Read complete");
    console.log(`Result length: ${result.length}`);

    const outputPath = toString(flags.output);
    const useBase64 = toBool(flags.base64);

    if (outputPath) {
        if (useBase64) {
            const buffer = Buffer.from(result, "base64");
            writeFileSync(outputPath, buffer);
        } else {
            writeFileSync(outputPath, result, "utf8");
        }
        console.log(`Wrote output: ${outputPath}`);
    } else {
        console.log(result.slice(0, 500));
    }

    return {result};
};

const instructionSuite = async (flags: Record<string, FlagValue>) => {
    const rpc = toString(flags.rpc) ?? DEFAULT_RPC;
    process.env.SOLANA_RPC_ENDPOINT = rpc;

    const keypairPath = toString(flags.keypair) ?? defaultKeypairPath();
    const receiverKeypairPath = toString(flags["receiver-keypair"]);
    const {runtime, programId, profile} = resolveRuntimeConfig(
        toString(flags.runtime),
    );
    const idl = loadIdl();
    const builder = createInstructionBuilder(
        idl as Parameters<typeof createInstructionBuilder>[0],
        profile.programId,
    );

    const connection = new Connection(rpc, "confirmed");
    const signer = loadKeypair(keypairPath);
    const receiver = receiverKeypairPath
        ? loadKeypair(receiverKeypairPath)
        : Keypair.generate();

    console.log(`Using RPC: ${rpc}`);
    console.log(`Runtime: ${runtime}`);
    console.log(`Program ID: ${programId.toBase58()}`);
    console.log(`Signer: ${signer.publicKey.toBase58()}`);
    console.log(
        `Receiver: ${receiver.publicKey.toBase58()}${receiverKeypairPath ? "" : " (generated)"}`,
    );

    if (!receiverKeypairPath) {
        logStep("Funding receiver");
        const balance = await fundReceiverIfNeeded(
            connection,
            signer,
            receiver.publicKey,
            DEFAULT_AIRDROP_LAMPORTS,
        );
        console.log(`Receiver balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    }

    logStep("User initialize");
    const signerUserState = getUserPda(profile, signer.publicKey);
    const receiverUserState = getUserPda(profile, receiver.publicKey);
    await ensureUserInitialized(connection, signer, builder, {
        user: signer.publicKey,
        code_account: getCodeAccountPda(profile, signer.publicKey),
        user_state: signerUserState,
        db_account: getDbAccountPda(profile, signer.publicKey),
        system_program: SystemProgram.programId,
    });
    await ensureUserInitialized(connection, receiver, builder, {
        user: receiver.publicKey,
        code_account: getCodeAccountPda(profile, receiver.publicKey),
        user_state: receiverUserState,
        db_account: getDbAccountPda(profile, receiver.publicKey),
        system_program: SystemProgram.programId,
    });

    logStep("Send code (linked-list)");
    const sendCodeIx = sendCodeInstruction(
        builder,
        {
            user: signer.publicKey,
            code_account: getCodeAccountPda(profile, signer.publicKey),
            system_program: SystemProgram.programId,
        },
        {
            code: `code-${randomUUID()}`,
            before_tx: "",
            method: 0,
            decode_break: 0,
        },
    );
    const sendCodeSignature = await sendTx(connection, signer, sendCodeIx);

    logStep("CodeIn session");
    const sessionChunks = Array.from(
        {length: DEFAULT_LINKED_LIST_THRESHOLD},
        (_, index) => `session-${index}-${randomUUID()}`,
    );
    const uploadSpeed = toString(flags.speed) ?? DEFAULT_SPEED;
    const sessionSignature = await writer.codein(
        {connection, signer},
        sessionChunks,
        runtime === "anchor",
        "session.txt",
        0,
        "text/plain",
        uploadSpeed,
    );

    logStep("Initialize db_root");
    const dbRootId = toSeed28(deriveSeedBytes(`dbroot-${randomUUID()}`));
    const dbRootIdArg = toSeedArg(dbRootId);
    const dbRoot = getDbRootPda(profile, dbRootId);
    console.log(`db_root_id: ${toHex(dbRootId)}`);
    console.log(`db_root: ${dbRoot.toBase58()}`);
    const initDbRootIx = initializeDbRootInstruction(
        builder,
        {
            db_root: dbRoot,
            signer: signer.publicKey,
            system_program: SystemProgram.programId,
        },
        {db_root_id: dbRootIdArg},
    );
    await sendTx(connection, signer, initDbRootIx);

    logStep("Create table");
    const tableSeed = toSeed28(deriveSeedBytes(`table-${randomUUID()}`));
    const tableSeedArg = toSeedArg(tableSeed);
    const table = getTablePda(profile, dbRoot, tableSeed);
    const instructionTable = getInstructionTablePda(profile, dbRoot, tableSeed);
    const tableRef = getTableRefPda(profile, dbRoot, tableSeed);
    const targetTableRef = getTargetTableRefPda(profile, dbRoot, tableSeed);
    const tableName = `cli_table_${Date.now()}`;
    const createTableIx = createTableInstruction(
        builder,
        {
            db_root: dbRoot,
            receiver: new PublicKey(DEFAULT_WRITE_FEE_RECEIVER),
            signer: signer.publicKey,
            table,
            instruction_table: instructionTable,
            table_ref: tableRef,
            target_table_ref: targetTableRef,
            system_program: SystemProgram.programId,
        },
        {
            db_root_id: dbRootIdArg,
            table_seed: tableSeedArg,
            table_name: Buffer.from(tableName, "utf8"),
            column_names: [
                Buffer.from("id", "utf8"),
                Buffer.from("name", "utf8"),
                Buffer.from("note", "utf8"),
            ],
            id_col: Buffer.from("id", "utf8"),
            ext_keys: [],
            gate_mint_opt: null,
            writers_opt: null,
        },
    );
    await sendTx(connection, signer, createTableIx);

    logStep("Update db_root table list");
    const updateListIx = updateDbRootTableListInstruction(
        builder,
        {
            db_root: dbRoot,
            signer: signer.publicKey,
        },
        {
            db_root_id: dbRootIdArg,
            new_table_seeds: [tableSeedArg],
        },
    );
    await sendTx(connection, signer, updateListIx);

    logStep("Update table");
    const updateTableIx = updateTableInstruction(
        builder,
        {
            db_root: dbRoot,
            table,
            signer: signer.publicKey,
        },
        {
            db_root_id: dbRootIdArg,
            table_seed: tableSeedArg,
            table_name: Buffer.from(`${tableName}_v2`, "utf8"),
            column_names: [
                Buffer.from("id", "utf8"),
                Buffer.from("name", "utf8"),
                Buffer.from("note", "utf8"),
                Buffer.from("updated", "utf8"),
            ],
            id_col: Buffer.from("id", "utf8"),
            ext_keys: [],
            writers_opt: null,
        },
    );
    await sendTx(connection, signer, updateTableIx);

    logStep("Write data");
    const rowJson = JSON.stringify({
        id: `row-${randomUUID()}`,
        name: "Alice",
        note: "hello",
        updated: new Date().toISOString(),
        padding: "x".repeat(DEFAULT_LINKED_LIST_THRESHOLD * 20),
    });
    const rowChunks = buildSessionChunks(rowJson);
    const rowSignature = await writer.codein(
        {connection, signer},
        rowChunks,
        runtime === "anchor",
        "row.json",
        0,
        "application/json",
        uploadSpeed,
    );
    const writeDataIx = writeDataInstruction(
        builder,
        {
            db_root: dbRoot,
            table,
            table_ref: tableRef,
            signer_ata: signer.publicKey,
            signer: signer.publicKey,
        },
        {
            db_root_id: dbRootIdArg,
            table_seed: tableSeedArg,
            row_json_tx: Buffer.from(rowSignature, "utf8"),
        },
    );
    await sendTx(connection, signer, writeDataIx);

    logStep("Update user metadata");
    const updateUserIx = updateUserMetadataInstruction(
        builder,
        {
            user: signerUserState,
            db_root: dbRoot,
            signer: signer.publicKey,
            system_program: SystemProgram.programId,
        },
        {
            db_root_id: dbRootIdArg,
            meta: Buffer.from(sessionSignature, "utf8"),
        },
    );
    await sendTx(connection, signer, updateUserIx);

    logStep("Request connection");
    const connectionSeed = toSeed28(
        deriveDmSeed(
            signer.publicKey.toBase58(),
            receiver.publicKey.toBase58(),
        ),
    );
    const connectionSeedArg = toSeedArg(connectionSeed);
    const connectionTable = getConnectionTablePda(
        profile,
        dbRoot,
        connectionSeed,
    );
    const connectionInstructionTable = getConnectionInstructionTablePda(
        profile,
        dbRoot,
        connectionSeed,
    );
    const connectionTableRef = getConnectionTableRefPda(
        profile,
        dbRoot,
        connectionSeed,
    );
    const connectionTargetRef = getTargetConnectionTableRefPda(
        profile,
        dbRoot,
        connectionSeed,
    );
    const requestIx = requestConnectionInstruction(
        builder,
        {
            requester: signer.publicKey,
            db_root: dbRoot,
            connection_table: connectionTable,
            instruction_table: connectionInstructionTable,
            requester_user: signerUserState,
            receiver_user: receiverUserState,
            table_ref: connectionTableRef,
            target_table_ref: connectionTargetRef,
            system_program: SystemProgram.programId,
        },
        {
            db_root_id: dbRootIdArg,
            connection_seed: connectionSeedArg,
            receiver: receiver.publicKey,
            table_name: Buffer.from("cli_dm", "utf8"),
            column_names: [
                Buffer.from("id", "utf8"),
                Buffer.from("message", "utf8"),
            ],
            id_col: Buffer.from("id", "utf8"),
            ext_keys: [],
            user_payload: Buffer.from(
                JSON.stringify({note: "instruction-suite"}),
                "utf8",
            ),
        },
    );
    await sendTx(connection, signer, requestIx);

    logStep("Approve connection");
    const manageIx = manageConnectionInstruction(
        builder,
        {
            db_root: dbRoot,
            connection_table: connectionTable,
            signer: receiver.publicKey,
        },
        {
            db_root_id: dbRootIdArg,
            connection_seed: connectionSeedArg,
            new_status: CONNECTION_STATUS_APPROVED,
        },
    );
    await sendTx(connection, receiver, manageIx);

    logStep("Write connection data");
    const dmRowJson = JSON.stringify({
        id: `dm-${randomUUID()}`,
        message: "hello from cli",
        padding: "x".repeat(DEFAULT_LINKED_LIST_THRESHOLD * 20),
    });
    const dmRowChunks = buildSessionChunks(dmRowJson);
    const dmRowSignature = await writer.codein(
        {connection, signer},
        dmRowChunks,
        runtime === "anchor",
        "dm.json",
        0,
        "application/json",
        uploadSpeed,
    );
    const writeConnIx = writeConnectionDataInstruction(
        builder,
        {
            db_root: dbRoot,
            connection_table: connectionTable,
            table_ref: connectionTableRef,
            signer: signer.publicKey,
        },
        {
            db_root_id: dbRootIdArg,
            connection_seed: connectionSeedArg,
            row_json_tx: Buffer.from(dmRowSignature, "utf8"),
        },
    );
    await sendTx(connection, signer, writeConnIx);

    logStep("Instruction suite completed");
    console.log(`send_code signature: ${sendCodeSignature}`);
    console.log(`session signature: ${sessionSignature}`);
    console.log(`table: ${table.toBase58()}`);
    console.log(`connection_table: ${connectionTable.toBase58()}`);
};

const roundtrip = async (flags: Record<string, FlagValue>) => {
    const readDelay = toNumber(flags["read-delay"]) ?? DEFAULT_READ_DELAY_MS;
    logStep("Roundtrip upload");
    const upload = await uploadSession(flags);
    logStep(`Waiting ${readDelay}ms before read`);
    await sleep(readDelay);

    const readFlags = {...flags, signature: upload.txSignature};
    logStep("Roundtrip read");
    const {result} = await readSession(readFlags);
    if (result === null) {
        throw new Error("Read returned null; replay was requested.");
    }

    if (upload.base64) {
        const original = upload.rawBytes
            ? upload.rawBytes
            : Buffer.from(upload.payload, "base64");
        const decoded = Buffer.from(result, "base64");
        if (!original.equals(decoded)) {
            throw new Error("Roundtrip mismatch (base64 decoded content differs).");
        }
        console.log("Roundtrip match (base64).");
        return;
    }

    if (result !== upload.payload) {
        throw new Error("Roundtrip mismatch (text differs).");
    }
    console.log("Roundtrip match (text).");
};

const main = async () => {
    const parsed = parseArgs(process.argv.slice(2));
    if (!parsed.command || parsed.flags.help) {
        console.log(usage);
        return;
    }

    if (parsed.flags["no-log-tx"]) {
        process.env.IQLABS_LOG_TX = "0";
    } else if (!process.env.IQLABS_LOG_TX) {
        process.env.IQLABS_LOG_TX = "1";
    }

    switch (parsed.command) {
        case "upload-session":
            await uploadSession(parsed.flags);
            return;
        case "read-session":
            await readSession(parsed.flags);
            return;
        case "roundtrip":
            await roundtrip(parsed.flags);
            return;
        case "linked-list-codein":
            await linkedListCodeIn(parsed.flags);
            return;
        case "instruction-suite":
            await instructionSuite(parsed.flags);
            return;
        default:
            console.log(`Unknown command: ${parsed.command}`);
            console.log(usage);
    }
};

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
