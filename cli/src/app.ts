import 'dotenv/config';
import { runFileManager } from "./commands/core_example/file-manager";
import { prompt, closeReadline } from "./utils/prompt";

const clearScreen = () => console.clear();

const showMainMenu = () => {
    console.log("\n============================");
    console.log("       IQLabs CLI Tool      ");
    console.log("============================\n");
    console.log("  1) File I/O (Write/Read)");
    console.log("  2) SolChat");
    console.log("  3) Exit");
    console.log("\n============================\n");
};

const handleSolChat = async () => {
    clearScreen();
    console.log("\n============================");
    console.log("          SolChat           ");
    console.log("============================\n");
    // TODO: Implement SolChat menu
    console.log("[SolChat - Coming Soon]");
    await prompt("\nPress Enter to return to main menu...");
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
