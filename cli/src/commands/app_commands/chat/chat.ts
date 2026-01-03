/**
 * chat command pseudocode
 * ---------------------------------------------------------------------------
 * Purpose: define the entrypoint that bundles chat actions inside the CLI.
 *          This is where we expose the ChatService flow described in chat-service.ts.
 */

// import { ChatService } from '../../../apps/chat/chat-service'
// import { logInfo } from '../../../utils/logger'

// export async function runChatCommand() {
//   1) Instantiate ChatService (sharing config/rootId/connection from setupCliDemo).
//   2) Use prompts to ask the user which action to run (requestConnection, sendMessage, readHistory, ...).
//   3) Switch on the chosen action and call the corresponding ChatService method.
//      - requestConnection: ask for wallet address/handle, then call service.requestConnection.
//      - sendMessage: ask for room id/handle/message, then call service.sendChat (internally uses utils/chunk.ts chunkString).
//      - readHistory: ask for room id, then call service.fetchChatHistory.
//   4) Display the results via logInfo or a simple table renderer.
// }
