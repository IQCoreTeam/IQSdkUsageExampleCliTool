import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
import {
    PublicKey,
    SystemProgram,
    SendTransactionError,
    Transaction,
    sendAndConfirmTransaction,
    type TransactionInstruction,
} from "@solana/web3.js";
import type {Connection, Signer} from "@solana/web3.js";
import {BorshAccountsCoder, type Idl} from "@coral-xyz/anchor";
import iqlabs from "iqlabs-sdk/src";

import {getWalletCtx} from "../../utils/wallet_manager";

const require = createRequire(import.meta.url);
const IDL = require("iqlabs-sdk/idl/code_in.json") as Idl;

const DEFAULT_ROOT_ID = "solchat-root";
const DM_TABLE_NAME = "dm";
const DM_COLUMNS = ["id", "text", "file", "sender", "timestamp"];
const DM_ID_COL = "id";

const makeMessageId = (sliceLength?: number) => {
    const uuid = typeof randomUUID === "function" ? randomUUID() : "";
    const id = uuid || Math.random().toString(36).slice(2, 10);
    return typeof sliceLength === "number" ? id.slice(0, sliceLength) : id;
};

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
                // ignore log fetch errors
            }
        }
        throw err;
    }
};

export class ChatService {
    readonly connection: Connection;
    readonly signer: Signer;
    readonly dbRootId: Uint8Array;
    readonly programId: PublicKey;
    readonly builder: ReturnType<typeof iqlabs.contract.createInstructionBuilder>;
    readonly accountCoder: BorshAccountsCoder;

    constructor(rootId = DEFAULT_ROOT_ID) {
        const {connection, signer} = getWalletCtx();
        this.connection = connection;
        this.signer = signer;
        this.dbRootId = Buffer.from(rootId, "utf8");
        this.programId = iqlabs.contract.getProgramId();
        this.builder = iqlabs.contract.createInstructionBuilder(IDL, this.programId);
        this.accountCoder = new BorshAccountsCoder(IDL);
    }

    async setupCliDemo() {
        await this.ensureRootAndTables();
        await this.ensureUserState();
    }

    async ensureRootAndTables() {
        const dbRoot = iqlabs.contract.getDbRootPda(this.dbRootId, this.programId);
        const info = await this.connection.getAccountInfo(dbRoot);
        if (info) {
            return {dbRoot, created: false};
        }
        const ix = iqlabs.contract.initializeDbRootInstruction(
            this.builder,
            {
                db_root: dbRoot,
                signer: this.signer.publicKey,
                system_program: SystemProgram.programId,
            },
            {db_root_id: this.dbRootId},
        );
        const signature = await sendInstruction(this.connection, this.signer, ix);
        return {dbRoot, created: true, signature};
    }

    async ensureUserState(metadataTxId?: string) {
        const user = this.signer.publicKey;
        const userState = iqlabs.contract.getUserPda(user, this.programId);
        const codeAccount = iqlabs.contract.getCodeAccountPda(user, this.programId);
        const userInventory = iqlabs.contract.getUserInventoryPda(user, this.programId);
        const info = await this.connection.getAccountInfo(userInventory);
        if (!info) {
            const ix = iqlabs.contract.userInitializeInstruction(this.builder, {
                user,
                code_account: codeAccount,
                user_state: userState,
                user_inventory: userInventory,
                system_program: SystemProgram.programId,
            });
            await sendInstruction(this.connection, this.signer, ix);
        }
        if (metadataTxId) {
            await this.updateUserMetadata(metadataTxId);
        }
        return {userState, userInventory, codeAccount};
    }

    async updateUserMetadata(metadataTxId: string) {
        const dbRoot = iqlabs.contract.getDbRootPda(this.dbRootId, this.programId);
        const userState = iqlabs.contract.getUserPda(this.signer.publicKey, this.programId);
        const ix = iqlabs.contract.updateUserMetadataInstruction(
            this.builder,
            {
                user: userState,
                db_root: dbRoot,
                signer: this.signer.publicKey,
                system_program: SystemProgram.programId,
            },
            {
                db_root_id: this.dbRootId,
                meta: Buffer.from(metadataTxId, "utf8"),
            },
        );
        return sendInstruction(this.connection, this.signer, ix);
    }

    async requestConnection(partner: PublicKey) {

        const dbRoot = iqlabs.contract.getDbRootPda(this.dbRootId, this.programId);
        const requester = this.signer.publicKey;
        const requesterBase58 = requester.toBase58();
        const receiverBase58 = partner.toBase58();
        const connectionSeed = iqlabs.utils.deriveDmSeed(requesterBase58, receiverBase58);
        const connectionSeedBuf = Buffer.from(connectionSeed);
        const connectionTable = iqlabs.contract.getConnectionTablePda(
            dbRoot,
            connectionSeed,
            this.programId,
        );
        const info = await this.connection.getAccountInfo(connectionTable);
        if (info) {
            return {connectionSeed, connectionTable, created: false};
        }

        const instructionTable = iqlabs.contract.getConnectionInstructionTablePda(
            dbRoot,
            connectionSeed,
            this.programId,
        );
        const tableRef = iqlabs.contract.getConnectionTableRefPda(
            dbRoot,
            connectionSeed,
            this.programId,
        );
        const targetTableRef = iqlabs.contract.getTargetConnectionTableRefPda(
            dbRoot,
            connectionSeed,
            this.programId,
        );
        const requesterUser = iqlabs.contract.getUserPda(requester, this.programId);
        const receiverUser = iqlabs.contract.getUserPda(partner, this.programId);

        const payloadBody: Record<string, string> = {
            dmTable: connectionTable.toBase58(),
        };

        const ix = iqlabs.contract.requestConnectionInstruction(
            this.builder,
            {
                requester,
                db_root: dbRoot,
                connection_table: connectionTable,
                instruction_table: instructionTable,
                requester_user: requesterUser,
                receiver_user: receiverUser,
                table_ref: tableRef,
                target_table_ref: targetTableRef,
                system_program: SystemProgram.programId,
            },
            {
                db_root_id: this.dbRootId,
                connection_seed: connectionSeedBuf,
                receiver: partner,
                table_name: Buffer.from(DM_TABLE_NAME, "utf8"),
                column_names: DM_COLUMNS.map((name) => Buffer.from(name, "utf8")),
                id_col: Buffer.from(DM_ID_COL, "utf8"),
                ext_keys: [],
                user_payload: Buffer.from(JSON.stringify(payloadBody), "utf8"),
            },
        );
        const signature = await sendInstruction(this.connection, this.signer, ix);
        return {connectionSeed, connectionTable, created: true, signature};
    }

    async manageConnection(connectionSeed: Uint8Array, newStatus: number) {
        const dbRoot = iqlabs.contract.getDbRootPda(this.dbRootId, this.programId);
        const connectionTable = iqlabs.contract.getConnectionTablePda(
            dbRoot,
            connectionSeed,
            this.programId,
        );
        const info = await this.connection.getAccountInfo(connectionTable);
        if (!info) {
            throw new Error("connection table not found");
        }
        const ix = iqlabs.contract.manageConnectionInstruction(
            this.builder,
            {
                db_root: dbRoot,
                connection_table: connectionTable,
                signer: this.signer.publicKey,
            },
            {
                db_root_id: this.dbRootId,
                connection_seed: Buffer.from(connectionSeed),
                new_status: newStatus,
            },
        );
        const signature = await sendInstruction(this.connection, this.signer, ix);
        return {signature, connectionTable};
    }

    async sendChat(roomSeed: Uint8Array, message: string, handle?: string) {
        const trimmed = message.trim();
        if (!trimmed) {
            throw new Error("message is empty");
        }
        const rowJson = JSON.stringify({
            id: makeMessageId(),
            text: trimmed,
            sender: handle?.trim() || this.signer.publicKey.toBase58(),
            timestamp: Date.now(),
        });
        return iqlabs.writer.writeRow(
            this.connection,
            this.signer,
            this.dbRootId,
            roomSeed,
            rowJson,
        );
    }

    async sendDm(dmSeed: Uint8Array, message: string, handle?: string) {
        const trimmed = message.trim();
        if (!trimmed) {
            throw new Error("message is empty");
        }
        const rowJson = JSON.stringify({
            id: makeMessageId(12),
            text: trimmed,
            sender: handle?.trim() || this.signer.publicKey.toBase58(),
            timestamp: Date.now(),
        });
        return iqlabs.writer.writeConnectionRow(
            this.connection,
            this.signer,
            this.dbRootId,
            dmSeed,
            rowJson,
        );
    }
    async fetchDmHistory(
        dmSeed: Uint8Array,
        options: { before?: string; limit?: number } = {},
    ) {
        const dbRoot = iqlabs.contract.getDbRootPda(this.dbRootId, this.programId);
        const connectionTable = iqlabs.contract.getConnectionTablePda(
            dbRoot,
            dmSeed,
            this.programId,
        );
        return iqlabs.reader.readTableRows(connectionTable, options);
    }


    async listFriends() {
        const owner = this.signer.publicKey.toBase58();
        const dbRoot = iqlabs.contract.getDbRootPda(this.dbRootId, this.programId);
        const accounts = await this.connection.getProgramAccounts(this.programId);
        const friends = [] as any[];

        for (const {account, pubkey} of accounts) {
            let decoded: any;
            try {
                decoded = this.accountCoder.decode("Connection", account.data);
            } catch {
                continue;
            }
            const partyA = new PublicKey(decoded.party_a).toBase58();
            const partyB = new PublicKey(decoded.party_b).toBase58();
            if (partyA !== owner && partyB !== owner) {
                continue;
            }
            const seed = iqlabs.utils.deriveDmSeed(partyA, partyB);
            const expected = iqlabs.contract.getConnectionTablePda(
                dbRoot,
                seed,
                this.programId,
            );
            if (!expected.equals(pubkey)) {
                continue;
            }
            const friendAddress = partyA === owner ? partyB : partyA;
            const statusCode = decoded.status;
            const status =
                statusCode === iqlabs.contract.CONNECTION_STATUS_PENDING
                    ? "pending"
                    : statusCode === iqlabs.contract.CONNECTION_STATUS_APPROVED
                        ? "approved"
                        : statusCode === iqlabs.contract.CONNECTION_STATUS_BLOCKED
                            ? "blocked"
                            : "unknown";
            const rawTimestamp =
                decoded.last_timestamp ?? decoded.lastTimestamp ?? 0;
            const lastTimestamp =
                typeof rawTimestamp === "number"
                    ? rawTimestamp
                    : Number(rawTimestamp?.toString?.() ?? 0);

            const dbRootId = decoded.db_root_id
                ? Buffer.from(decoded.db_root_id).toString("utf8")
                : "";

            friends.push({
                address: friendAddress,
                status,
                statusCode,
                requester: decoded.requester,
                blocker: decoded.blocker,
                seed,
                table: pubkey,
                partyA,
                partyB,
                lastTimestamp,
                dbRootId,
            });
        }

        friends.sort((a, b) => Number(b.lastTimestamp ?? 0) - Number(a.lastTimestamp ?? 0));
        return friends;
    }

    async listRooms() {
        const list = await iqlabs.reader.getTablelistFromRoot(
            this.connection,
            this.dbRootId,
        );
        const dbRoot = iqlabs.contract.getDbRootPda(this.dbRootId, this.programId);
        const seedHexes = [
            ...new Set([...list.tableSeeds, ...list.globalTableSeeds]),
        ];
        const rooms = [] as any[];

        for (const seedHex of seedHexes) {
            const seed = Buffer.from(seedHex, "hex");
            const table = iqlabs.contract.getTablePda(dbRoot, seed, this.programId);
            const info = await this.connection.getAccountInfo(table);
            let name = seedHex;
            if (info) {
                try {
                    const decoded = this.accountCoder.decode("Table", info.data) as {
                        name: Uint8Array;
                    };
                    const decodedName = Buffer.from(decoded.name)
                        .toString("utf8")
                        .replace(/\0+$/, "")
                        .trim();
                    if (decodedName) {
                        name = decodedName;
                    }
                } catch {
                    // ignore decode failures
                }
            }
            rooms.push({
                name,
                seed,
                seedHex,
                table,
            });
        }

        return rooms;
    }

    async createRoom(name: string) {
        const trimmed = name.trim();
        if (!trimmed) {
            throw new Error("room name is empty");
        }
        await this.ensureRootAndTables();
        const dbRoot = iqlabs.contract.getDbRootPda(this.dbRootId, this.programId);
        const tableSeed = iqlabs.utils.toSeedBytes(trimmed);
        const tableSeedBuf = Buffer.from(tableSeed);
        const table = iqlabs.contract.getTablePda(dbRoot, tableSeed, this.programId);
        const instructionTable = iqlabs.contract.getInstructionTablePda(
            dbRoot,
            tableSeed,
            this.programId,
        );
        const existing = await this.connection.getAccountInfo(table);
        if (existing) {
            return {table, instructionTable, created: false};
        }

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
                table_name: Buffer.from(trimmed, "utf8"),
                column_names: DM_COLUMNS.map((name) => Buffer.from(name, "utf8")),
                id_col: Buffer.from(DM_ID_COL, "utf8"),
                ext_keys: [],
                gate_mint_opt: null,
                writers_opt: null,
            },
        );
        const signature = await sendInstruction(this.connection, this.signer, ix);
        return {table, instructionTable, created: true, signature};
    }

    async subscribeToAccount(account: PublicKey, options: { limit?: number } = {}) {
        const limit =
            typeof options.limit === "number" && options.limit > 0 ? options.limit : 10;
        const seen = new Set<string>();
        const latest = await iqlabs.reader.fetchAccountTransactions(account, {
            limit,
        });
        for (const sig of latest) {
            seen.add(sig.signature);
        }

        const subscriptionId = this.connection.onAccountChange(
            account,
            async () => {
                const signatures = await iqlabs.reader.fetchAccountTransactions(account, {
                    limit,
                });
                const fresh = signatures.filter((sig) => !seen.has(sig.signature));
                if (fresh.length === 0) {
                    return;
                }
                for (const sig of fresh.reverse()) {
                    seen.add(sig.signature);
                    let result: {data: string | null; metadata: string};
                    try {
                        result = await iqlabs.reader.readCodeIn(sig.signature);
                    } catch (err) {
                        if (
                            err instanceof Error &&
                            err.message.includes(
                                "user_inventory_code_in instruction not found",
                            )
                        ) {
                            continue;
                        }
                        throw err;
                    }
                    const {data, metadata} = result;
                    if (!data) {
                        console.log({
                            signature: sig.signature,
                            metadata,
                            data: null,
                        });
                        continue;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                            console.log({...parsed, __txSignature: sig.signature});
                            continue;
                        }
                    } catch {
                        // fallthrough
                    }
                    console.log({signature: sig.signature, metadata, data});
                }
            },
            "confirmed",
        );

        return () => this.connection.removeAccountChangeListener(subscriptionId);
    }

    async joinRoom(roomSeed: Uint8Array, options: { limit?: number } = {}) {
        const dbRoot = iqlabs.contract.getDbRootPda(this.dbRootId, this.programId);
        const table = iqlabs.contract.getTablePda(dbRoot, roomSeed, this.programId);
        return this.subscribeToAccount(table, options);
    }

    async joinDm(dmSeed: Uint8Array, options: { limit?: number } = {}) {
        const dbRoot = iqlabs.contract.getDbRootPda(this.dbRootId, this.programId);
        const connectionTable = iqlabs.contract.getConnectionTablePda(
            dbRoot,
            dmSeed,
            this.programId,
        );
        return this.subscribeToAccount(connectionTable, options);
    }

    deriveRoomTable(roomSeed: Uint8Array) {
        const dbRoot = iqlabs.contract.getDbRootPda(this.dbRootId, this.programId);
        const table = iqlabs.contract.getTablePda(dbRoot, roomSeed, this.programId);
        const instructionTable = iqlabs.contract.getInstructionTablePda(
            dbRoot,
            roomSeed,
            this.programId,
        );
        return {table, instructionTable};
    }
}
