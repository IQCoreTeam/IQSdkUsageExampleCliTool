# IQLabs SDK Public API (Functions)

Scope: public exports from `iqlabs-sdk/src/contract` and `iqlabs-sdk/src/sdk`.

## Common types

```
Bytes = Uint8Array
OptionalPubkey = PublicKey | null
OptionalPubkeyList = PublicKey[] | null
ProgramProfile = { runtime: "anchor" | "pinocchio"; programId: PublicKey }
InstructionBuilder = { programId: PublicKey; build(name, accounts, args?) -> TransactionInstruction }
ConfirmedSignatureInfo = web3.js getSignaturesForAddress result type
SessionFinalize = { seq: BN; total_chunks: number }
TableCreateArgs = {
  db_root_id: Bytes;
  table_seed: Bytes;
  table_name: Bytes;
  column_names: Bytes[];
  id_col: Bytes;
  ext_keys: Bytes[];
  gate_mint_opt: OptionalPubkey;
  writers_opt: OptionalPubkeyList;
}
InstructionName =
  | create_admin_table
  | create_ext_table
  | create_private_table
  | create_session
  | create_table
  | database_instruction
  | db_code_in
  | db_code_in_for_free
  | initialize_config
  | initialize_db_root
  | manage_connection
  | post_chunk
  | request_connection
  | send_code
  | server_initialize
  | set_merkle_root
  | update_db_root_table_list
  | update_table
  | update_user_metadata
  | user_initialize
  | write_connection_data
  | write_data
```

## Contract profile

### createAnchorProfile

Signature: `createAnchorProfile(programId?: PublicKey): ProgramProfile`
Args: `programId` optional (defaults to `DEFAULT_ANCHOR_PROGRAM_KEY`)
Returns: `ProgramProfile`

### createPinocchioProfile

Signature: `createPinocchioProfile(programId: PublicKey): ProgramProfile`
Args: `programId` required
Returns: `ProgramProfile`

## PDA helpers (contract/pda.ts)

- `getConfigPda(profile: ProgramProfile): PublicKey`
- `getDbRootPda(profile: ProgramProfile, dbRootId: Bytes): PublicKey`
- `getTablePda(profile: ProgramProfile, dbRoot: PublicKey, tableSeed: Bytes): PublicKey`
- `getInstructionTablePda(profile: ProgramProfile, dbRoot: PublicKey, tableSeed: Bytes): PublicKey`
- `getConnectionTablePda(profile: ProgramProfile, dbRoot: PublicKey, connectionSeed: Bytes): PublicKey`
- `getConnectionInstructionTablePda(profile: ProgramProfile, dbRoot: PublicKey, connectionSeed: Bytes): PublicKey`
- `getTableRefPda(profile: ProgramProfile, dbRoot: PublicKey, tableSeed: Bytes): PublicKey`
- `getConnectionTableRefPda(profile: ProgramProfile, dbRoot: PublicKey, connectionSeed: Bytes): PublicKey`
- `getTargetTableRefPda(profile: ProgramProfile, dbRoot: PublicKey, tableSeed: Bytes): PublicKey`
- `getTargetConnectionTableRefPda(profile: ProgramProfile, dbRoot: PublicKey, connectionSeed: Bytes): PublicKey`
- `getUserPda(profile: ProgramProfile, user: PublicKey): PublicKey`
- `getSessionPda(profile: ProgramProfile, user: PublicKey, seq: bigint | number): PublicKey`
- `getCodeAccountPda(profile: ProgramProfile, user: PublicKey): PublicKey`
- `getDbAccountPda(profile: ProgramProfile, user: PublicKey): PublicKey`
- `getServerAccountPda(profile: ProgramProfile, user: PublicKey, serverId: string): PublicKey`

## Instruction builder

Signature: `createInstructionBuilder(idl: Idl, programId: PublicKey): InstructionBuilder`
Output:
`InstructionBuilder.build(name: InstructionName, accounts: Record<string, PublicKey | undefined>, args?: TArgs): TransactionInstruction`

## Instruction helpers (contract/instructions.ts)

### createAdminTableInstruction

Signature: `createAdminTableInstruction(builder, accounts, args): TransactionInstruction`
Accounts: `{ signer, db_root, table, instruction_table, table_ref, target_table_ref, system_program? }`
Args: `TableCreateArgs`

### createExtTableInstruction

Signature: `createExtTableInstruction(builder, accounts, args): TransactionInstruction`
Accounts: `{ signer, db_root, table, instruction_table, table_ref, target_table_ref, system_program? }`
Args: `TableCreateArgs`

### createPrivateTableInstruction

Signature: `createPrivateTableInstruction(builder, accounts, args): TransactionInstruction`
Accounts: `{ signer, db_root, table, instruction_table, table_ref, target_table_ref, system_program? }`
Args: `TableCreateArgs`

### createSessionInstruction

Signature: `createSessionInstruction(builder, accounts, args): TransactionInstruction`
Accounts: `{ user, user_state, session, system_program? }`
Args: `{ seq: BN }`

### createTableInstruction

Signature: `createTableInstruction(builder, accounts, args): TransactionInstruction`
Accounts: `{ db_root, receiver, signer, table, instruction_table, table_ref, target_table_ref, system_program? }`
Args: `TableCreateArgs`

### databaseInstructionInstruction

Signature: `databaseInstructionInstruction(builder, accounts, args): TransactionInstruction`
Accounts: `{ db_root, table, instruction_table, table_ref, target_table_ref, signer_ata?, signer }`
Args: `{ db_root_id: Bytes, table_seed: Bytes, table_name: Bytes, target_tx: Bytes, content_json_tx: Bytes }`

### dbCodeInInstruction

Signature: `dbCodeInInstruction(builder, accounts, args): TransactionInstruction`
Accounts: `{ user, db_account, system_program? }`
Args: `{ on_chain_path: string, metadata: string, session: SessionFinalize | null }`

### dbCodeInForFreeInstruction

Signature: `dbCodeInForFreeInstruction(builder, accounts, args): TransactionInstruction`
Accounts: `{ user, db_account, config, system_program? }`
Args: `{ on_chain_path: string, metadata: string, session: SessionFinalize | null, proof: Bytes[] }`

### initializeConfigInstruction

Signature: `initializeConfigInstruction(builder, accounts, args): TransactionInstruction`
Accounts: `{ user, config, system_program? }`
Args: `{ merkle_root: Bytes }`

### initializeDbRootInstruction

Signature: `initializeDbRootInstruction(builder, accounts, args): TransactionInstruction`
Accounts: `{ db_root, signer, system_program? }`
Args: `{ db_root_id: Bytes }`

### manageConnectionInstruction

Signature: `manageConnectionInstruction(builder, accounts, args): TransactionInstruction`
Accounts: `{ db_root, connection_table, signer }`
Args: `{ db_root_id: Bytes, connection_seed: Bytes, new_status: number }`

### postChunkInstruction

Signature: `postChunkInstruction(builder, accounts, args): TransactionInstruction`
Accounts: `{ user, session }`
Args: `{ seq: BN, index: number, chunk: string, method: number, decode_break: number }`

### requestConnectionInstruction

Signature: `requestConnectionInstruction(builder, accounts, args): TransactionInstruction`
Accounts:
`{ requester, db_root, connection_table, instruction_table, requester_user, receiver_user, table_ref, target_table_ref, system_program? }`
Args:
`{ db_root_id: Bytes, connection_seed: Bytes, receiver: PublicKey, table_name: Bytes, column_names: Bytes[], id_col: Bytes, ext_keys: Bytes[], user_payload: Bytes }`

### sendCodeInstruction

Signature: `sendCodeInstruction(builder, accounts, args): TransactionInstruction`
Accounts: `{ user, code_account, system_program? }`
Args: `{ code: string, before_tx: string, method: number, decode_break: number }`

### serverInitializeInstruction

Signature: `serverInitializeInstruction(builder, accounts, args): TransactionInstruction`
Accounts: `{ user, server_account, system_program? }`
Args: `{ server_id: string, server_type: string, allowed_merkle_root: string }`

### setMerkleRootInstruction

Signature: `setMerkleRootInstruction(builder, accounts, args): TransactionInstruction`
Accounts: `{ authority, config }`
Args: `{ new_root: Bytes, new_authority: OptionalPubkey }`

### updateDbRootTableListInstruction

Signature: `updateDbRootTableListInstruction(builder, accounts, args): TransactionInstruction`
Accounts: `{ db_root, signer }`
Args: `{ db_root_id: Bytes, new_table_seeds: Bytes[] }`

### updateTableInstruction

Signature: `updateTableInstruction(builder, accounts, args): TransactionInstruction`
Accounts: `{ db_root, table, signer }`
Args:
`{ db_root_id: Bytes, table_seed: Bytes, table_name: Bytes, column_names: Bytes[], id_col: Bytes, ext_keys: Bytes[], writers_opt: OptionalPubkeyList }`

### updateUserMetadataInstruction

Signature: `updateUserMetadataInstruction(builder, accounts, args): TransactionInstruction`
Accounts: `{ user, db_root, signer, system_program? }`
Args: `{ db_root_id: Bytes, meta: Bytes }`

### userInitializeInstruction

Signature: `userInitializeInstruction(builder, accounts): TransactionInstruction`
Accounts: `{ user, code_account, user_state, db_account, system_program? }`
Args: none

### writeConnectionDataInstruction

Signature: `writeConnectionDataInstruction(builder, accounts, args): TransactionInstruction`
Accounts: `{ db_root, connection_table, table_ref, signer }`
Args: `{ db_root_id: Bytes, connection_seed: Bytes, row_json_tx: Bytes }`

### writeDataInstruction

Signature: `writeDataInstruction(builder, accounts, args): TransactionInstruction`
Accounts: `{ db_root, table, table_ref, signer_ata?, signer }`
Args: `{ db_root_id: Bytes, table_seed: Bytes, row_json_tx: Bytes }`

## SDK writer (sdk/writer/index.ts)

Signature:
`codein(input: { connection: Connection; signer: Signer }, chunks: string[], isAnchor?: boolean, filename?: string, method?: number, filetype?: string): Promise<string>`
Output: transaction signature (sendAndConfirmTransaction result)

## SDK reader (sdk/reader/index.ts)

- `readInscription(txSignature: string): Promise<{ result: string | null }>`
- `readDBMetadata(txSignature: string): Promise<{ onChainPath: string; metadata: string }>`
-
`readSession(sessionPubkey: string, readOption: { isReplay: boolean; freshness?: "fresh" | "recent" | "archive" }): Promise<{ result: string | null }>`
-
`readLinkedListFromTail(tailTx: string, readOption: { isReplay: boolean; freshness?: "fresh" | "recent" | "archive" }): Promise<{ result: string }>`
-
`readUserState(userPubkey: string): Promise<{ owner: string; metadata: string | null; totalSessionFiles: bigint; profileData?: string }>`
- `readConnection(dbRootId: Uint8Array | string, partyA: string, partyB: string): Promise<{ status: string }>`
- `decideReadMode(txSignature: string): Promise<{ isReplay: boolean; freshness?: "fresh" | "recent" | "archive" }>`
-
`fetchAccountTransactions(account: string | PublicKey, options?: { before?: string; limit?: number }): Promise<ReadonlyArray<ConfirmedSignatureInfo>>`
- `getSessionPdaList(userPubkey: string): Promise<string[]>`

## Replay service client (sdk/reader/replayservice.ts)

### constructor

Signature:
`new ReplayServiceClient(config?: { replayBaseUrl?: string; headers?: Record<string, string>; fetcher?: typeof fetch })`

### enqueueReplay

Signature:
`enqueueReplay(request: { sessionPubkey: string }): Promise<{ jobId: string; status: string; retryAfter?: number; estimatedWaitMs?: number }>`

### getReplayStatus

Signature:
`getReplayStatus(jobId: string): Promise<{ jobId: string; status: string; error?: string; chunkStats?: Record<string, unknown>; hasArtifact: boolean; downloadUrl?: string }>`

### getReplayLogs

Signature: `getReplayLogs(jobId: string): Promise<Record<string, unknown>>`

### downloadReplay

Signature: `downloadReplay(jobId: string): Promise<{ data: Uint8Array; contentType?: string; filename?: string }>`
