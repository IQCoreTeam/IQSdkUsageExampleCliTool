import { Connection, Keypair, Transaction, TransactionInstruction } from '@solana/web3.js'
import { logInfo } from './logger'

/**
 * buildAndSendTx
 * - instructions: array of instructions to send
 * - connection: web3.js Connection instance
 * - signer: Keypair (or any Signer required by sendTransaction)
 */
export async function buildAndSendTx(
  connection: Connection,
  signer: Keypair,
  instructions: TransactionInstruction[],
) {
  if (!instructions.length) return
  const tx = new Transaction()
  tx.add(...instructions)
  const latestBlockhash = await connection.getLatestBlockhash('confirmed')
  tx.recentBlockhash = latestBlockhash.blockhash
  tx.feePayer = signer.publicKey

  logInfo('[tx] sending', { count: instructions.length })
  const signature = await connection.sendTransaction(tx, [signer])
  await connection.confirmTransaction(signature, 'confirmed')
  logInfo('[tx] confirmed', { signature })
  return signature
}
