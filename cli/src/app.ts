import 'dotenv/config';
import { runFileManager } from "./ui/menus/file-manager";
import { runChatCommand } from "./ui/menus/chat";
import { runGitMenu } from "./ui/menus/git-menu";
import { prompt, closeReadline } from "./utils/prompt";
import { runPlaylistMenu } from "./ui/menus/playlist-menu";
import iqlabs from "iqlabs-sdk/src";

const rpcUrl = process.env.SOLANA_RPC_ENDPOINT!;
const clearScreen = () => console.clear();

const showMainMenu = () => {
    console.log("\n============================");
    console.log("       IQLabs CLI Tool      ");
    console.log("============================\n");
    console.log("  1) File I/O (Write/Read)");
    console.log("  2) SolChat");
    console.log("  3) Semantic Playlist");
    console.log("  4) Git on Chain");
    console.log("  5) Exit");
    console.log("\n============================\n");
    iqlabs.setRpcUrl(rpcUrl)
    //TODO need to check if this actually working or its not working when constance is set.

};

const handleSolChat = async () => {
    clearScreen();
    await runChatCommand();
};

const main = async () => {
    let running = true;

    while (running) {
        clearScreen();
        showMainMenu();
        const choice = (await prompt("Select option: ")).trim();

        switch (choice) {
            case "1":
                await runFileManager();
                break;
            case "2":
                await handleSolChat();
                break;
            case "3":
                await runPlaylistMenu();
                break;
            case "4":
                await runGitMenu();
                break;
            case "5":
                running = false;
                console.log("\nGoodbye!\n");
                break;
            default:
                console.log("\nInvalid option");
                await prompt("\nPress Enter to continue...");
        }
    }

    closeReadline();
};

main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
});
