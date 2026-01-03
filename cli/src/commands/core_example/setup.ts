/**
 * CLI `setup` (a.k.a. `setup cli`) command pseudocode
 * ---------------------------------------------------------------------------
 * Purpose: prepare wallet/RPC/PDA information before running chat/DM examples
 *          and guide the user through the required inputs. This flow is only
 *          used by the CLI tool.
 */

// async function setupCliDemo(): Promise<void> {
//   1) Load config + ask for root id
//      - Read default RPC/url/path and default rootId (e.g., 'solchat-root') from src/config.ts.
//      - Prompt the user for a root id (allow overriding the default).
//      - Print both the default and the entered value and explain that changing it creates a new app instance.
//      - Convert rootId -> Bytes via TextEncoder and store in state.
//
//   2) Load keypair
//      - fs/promises.readFile(keypairPath) -> JSON parse -> Uint8Array
//      - Keypair.fromSecretKey (web3.js) -> signer
//
//   3) Establish RPC connection
//      - new Connection(rpcUrl, 'confirmed')
//      - Test with connection.getLatestBlockhash()
//
//   4) Bootstrap SDK
//      - createAnchorProfile(programId?) for ProgramProfile
//      - createInstructionBuilder(idl, programId) for InstructionBuilder
//
//   5) Derive base PDAs
//      - getDbRootPda(profile, rootSeedBytes)
//      - getTablePda / getInstructionTablePda / getTableRefPda / getTargetTableRefPda
//      - Follow configs.ts (solchat legacy) for seed conventions
//      - Log the derived root/table PDAs alongside the entered root id to show how the id affects them
// }
