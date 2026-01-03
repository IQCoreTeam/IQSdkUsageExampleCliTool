////Users/sumin/WebstormProjects/solchat-web/lib/onchainDB stores the legacy implementation.

// Latest contract changes live at:
///Users/sumin/RustroverProjects/IQLabsContract (see updates.txt for details).
//cli/docs/iqlabs-sdk-api.md lists the SDK functions we should rely on.
////Users/sumin/WebstormProjects/solchat-web/lib/onchainDB shows the behavior we need to replicate.
// /Users/sumin/WebstormProjects/iqlabs-sdk/src hosts the main SDK source.
//Use that SDK + /Users/sumin/WebstormProjects/iqlabs-sdk-cli-example/cli/docs/iqlabs-sdk-api.md when writing this CLI code.
//

/**
 * ChatService pseudocode (read legacy comments above before filling in real code)
 * -----------------------------------------------------------------------------
 * Goal: port the solchat-web/lib/onchainDB connection/DM/message flow into a CLI
 *       while using only the functions documented in docs/iqlabs-sdk-api.md.
 *       Note which SDK/lib each step should rely on so implementation is trivial.
 *       The entire file is a blueprint for the SDK showcase CLI.
 */

// 1. Dependency loading plan -------------------------------------------------
// - web3.js: Connection, Keypair, PublicKey, TransactionInstruction
// - @solana/spl-token: getAssociatedTokenAddress (if needed)
// - @IQLabsOfficial/iqlabs-sdk (or local SDK build):
//     createAnchorProfile, createInstructionBuilder,
//     getDbRootPda, getTablePda, getInstructionTablePda,
//     getTableRefPda, getTargetTableRefPda,
//     createSessionInstruction, postChunkInstruction, sendCodeInstruction,
//     dbCodeInInstruction, dbCodeInForFreeInstruction,
//     requestConnectionInstruction, manageConnectionInstruction,
//     updateUserMetadataInstruction, write_data / database_instruction helpers, etc.
// - cli/src/config.ts: load RPC endpoint, default root/table seeds, and local keypair path.
// - Store the rootId (Bytes) provided during setupCliDemo inside ChatService and reuse it for every command.
// - Legacy reference: /Users/sumin/WebstormProjects/solchat-web/lib/iq/* (reader/transaction code).

// 2. CLI make app (root initializer & metadata helpers) -----------------------
// async function makeCliApp(rootId: string): Promise<void> {
//   - Accept the rootId via prompts or CLI flag.
//   - Convert rootId -> Bytes using TextEncoder.
//   - Prepare createAnchorProfile(programId) and createInstructionBuilder(...).
//   - Compute getDbRootPda(profile, rootBytes).
//   - Call initializeDbRootInstruction(builder, { db_root, signer }, { db_root_id: rootBytes }).
//   - Build a Transaction, add the instruction, then sendAndConfirmTransaction.
//   - Log the resulting root PDA address / txid.
// }
// async function updateUserMetadata(metadataTxId: string) { ... } // uses updateUserMetadataInstruction
// async function syncSessionCountFromUpdates() { ... } // follow updates.txt

// 3. ChatService structure -----------------------------------------------------
// class ChatService {
//   constructor(deps: { rpcUrl: string; keypairPath: string; rootSeed: string; chatTableSeed: string; })
//
//   async setupCliDemo(): Promise<void> // follow the steps described in core_example/setup.ts
//
//   async ensureRootAndTables(): Promise<void>
//     - If the root PDA is missing, send initializeDbRootInstruction.
//     - Verify the chat table exists; otherwise run createTableInstruction.
//     - When a friend/connection table is needed, call createExtTableInstruction or createAdminTableInstruction.
//
//   async ensureUserState(metadataTxId?: string): Promise<void>
//     - Derive getUserPda(profile, wallet.publicKey).
//     - If it does not exist, prepare a user_initialize instruction (update docs if signatures change).

//   async requestConnection(partner: PublicKey, payload: { handle: string; intro: string })
//     - deriveDmSeed handles connection_seed automatically, so no manual sorting/hashing required.
//     - Reuse the rootSeedBytes from setup as db_root_id.
//     - Derive PDAs via getConnectionTablePda, getConnectionInstructionTablePda, etc.
//     - Check via RPC if the connection table/account already exists; only send requestConnectionInstruction when absent.
//     - Call requestConnectionInstruction(builder, accounts, args) to create the CPDA.
//
//   async manageConnection(connectionSeed: Bytes, newStatus: number)
//     - Use manageConnectionInstruction(builder, { db_root, connection_table, signer }, { ... }).
//     - Implement status/requester/blocker logic exactly as described in updates.txt.
//
//   async sendChat(roomSeed: Bytes, message: string, handle: string)
//     - Split message via utils/chunk.ts chunkString (default 900 bytes) -> chunks[].
//     - Run createSessionInstruction/postChunkInstruction/sendCodeInstruction internally and store the final chunk tx signature as tailTx.
//     - After chunking, call codeIn/dbCodeInInstruction to write the row and embed the returned db transaction signature into the row JSON.
//     - Honor connection_table writer list / gate mint checks when required.
//     - Note: once single-chunk support ships we plan to skip the session/linked-list path and use dbCodeIn directly (requires enlarging tx refs).
//
//   async fetchChatHistory(roomSeed: Bytes, options)
//     - Equivalent to readRecentRows: call web3.js connection.getSignaturesForAddress(roomTable).
//     - Port reconstructMessageFromChain from solchat-web/lib/iq/reader.ts unless the SDK reader already exposes it.
//     - Follow each row's tailTx to rebuild the sendCodeInstruction chain (this gets simpler once we skip sessions for single chunks).
//     - Read handle/timestamp from the db row payload.
//
//   helper: deriveRoomTable(roomSeed) // derive all PDAs needed for a chat room table
//     - getTablePda(profile, db_root, roomSeed)
//     - Also compute instruction_table/ref/target_ref so databaseInstructionInstruction receives every PDA at once.
//
// }
//
// 3. CLI wiring (chat command)
// - Instantiate ChatService from src/commands/app_commands/chat/chat.ts.
// - Combine ChatService.requestConnection / sendChat / fetchChatHistory.
// - Output in the same table/log style used by src/ui/menu.ts.
//
// 4. Test plan
// - Create test/chat-service.spec.ts that mocks web3 to verify chunk builder + PDA derivations fire.
// - e2e: run against devnet RPC with a fixture wallet (configurable env).
//
// TODO: When implementing, translate each bullet into concrete types/functions and confirm signatures via docs/iqlabs-sdk-api.md.
