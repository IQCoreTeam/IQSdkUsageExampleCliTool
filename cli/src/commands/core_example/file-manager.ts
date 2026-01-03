/**
 * File Manager CLI pseudocode
 * ---------------------------------------------------------------------------
 * Purpose: handle on-chain file (inscription) tasks from a single CLI menu,
 *          using the connection/signer/root info gathered during setup and the helpers in utils/chunk.ts.
 *
 * Main loop
 * - Use a select prompt with the following actions:
 *   1) "Inscribe file/string"
 *   2) "Read inscription by signature"
 *   3) "List my session PDAs"
 *   4) "Fetch DB transactions (by PDA)"
 *   5) "Back"
 * - Exit the loop if the user picks "Back" or cancels (undefined).
 *
 * Action details
 * 1) Inscribe
 *    - Inputs: file path or raw string, filename(optional), filetype(optional)
 *    - Split bytes via utils/chunk.resolveChunks (chunkSize=900 default).
 *    - Call iqlabs-sdk writer.codein({ connection, signer }, chunks, isAnchor?, filename, method?, filetype).
 *    - Log the returned signature via logInfo.
 *
 * 2) Read inscription
 *    - Input: tx signature
 *    - Call iqlabs-sdk reader.readInscription(signature).
 *    - Log the resulting JSON via logInfo.
 *
 * 3) List my session PDAs
 *    - Input: user public key (default to signer.publicKey but allow overrides)
 *    - Call reader.getSessionPdaList(userPubkey).
 *    - Output the array via table/log formatting.
 *
 * 4) List my DB transactions
 *    - Inputs: db PDA (e.g., from getDbRootPda), limit(default 10), before(optional)
 *    - Call reader.fetchAccountTransactions(dbPda, { limit, before }).
 *    - Render the ConfirmedSignatureInfo list in a table.
 *
 * Logging/util
 * - Use logInfo / logError from src/utils/logger.
 * - Catch errors, display the message, and continue the loop.
 *
 * TODO: When implementing, import prompts/logger/chunk utils/sdk reader+writer modules
 *       and translate this flow into actual code.
 */
