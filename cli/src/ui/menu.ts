/**
 * CLI menu pseudocode
 * ---------------------------------------------------------------------------
 * Purpose: define the main menu/navigation that appears when the CLI launches.
 *          Users pick among chat, setup, file manager, etc.
 */

// import prompts from 'prompts'
// import { runChatCommand } from '../commands/app_commands/chat/chat'
// import { runSetupCommand } from '../commands/core_example/setup'
// import { runFileManagerCommand } from '../commands/core_example/file-manager' // implement the flow documented in file-manager.ts
// import { logInfo } from '../utils/logger'

// export async function showMainMenu() {
//   let setupCompleted = false
//   const choices = [
//     { title: 'Setup CLI (root, keypair, RPC)', value: 'setup' },
//     { title: 'Chat Actions', value: 'chat' },
//     { title: 'Inscribe (code in / db code in)', value: 'inscribe' },
//     { title: 'Exit', value: 'exit' },
//   ]
//   const { action } = await prompts({ type: 'select', name: 'action', message: 'Select action', choices })
//   switch (action) {
//     case 'setup':
//       await runSetupCommand()
//       setupCompleted = true
//       break
//     case 'chat':
//       if (!setupCompleted) {
//         logInfo('Run setup first.')
//       } else {
//         await runChatCommand()
//       }
//       break
//     case 'inscribe':
//       if (!setupCompleted) {
//         logInfo('Run setup first.')
//       } else {
//         await runFileManagerCommand()
//       }
//       break
//     default:
//       logInfo('Bye!')
//   }
//   // Optionally wrap this in a loop to keep showing the menu.
// }
