import readline from "node:readline";
import iqlabs from "iqlabs-sdk/src";
import {PublicKey} from "@solana/web3.js";

import {ChatService} from "../../apps/chat/chat-service";
import {logError, logInfo, logTable} from "../../utils/logger";
import {closeReadline, prompt} from "../../utils/prompt";

const showChatMenu = () => {
    console.log("\n============================");
    console.log("          SolChat           ");
    console.log("============================\n");
    console.log("DM");
    console.log("  1) See My Friend List");
    console.log("  2) Request connection");
    console.log("");
    console.log("Room");
    console.log("  3) Join room ");
    console.log("  4) Create room (table)");

    console.log("");
    console.log("  9) Back");
    console.log("\n============================\n");
};

const selectFromList = async (
    title: string,
    items: any[],
    render: (item: any, selected: boolean) => string,
) => {
    if (items.length === 0) {
        return null;
    }
    if (!process.stdin.isTTY) {
        console.clear();
        console.log(title);
        items.forEach((item, index) => {
            console.log(`  ${index + 1}) ${render(item, false)}`);
        });
        const input = (await prompt("Select: ")).trim();
        const choice = Number.parseInt(input, 10);
        if (!choice || choice < 1 || choice > items.length) {
            return null;
        }
        return choice - 1;
    }

    closeReadline();
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();

    let index = 0;
    const draw = () => {
        console.clear();
        console.log(title);
        console.log("");
        items.forEach((item, i) => {
            const prefix = i === index ? "> " : "  ";
            console.log(prefix + render(item, i === index));
        });
        console.log("");
        console.log("Enter = select, Esc = back");
    };

    return await new Promise<number | null>((resolve) => {
        const onKey = (_: string, key: readline.Key) => {
            if (key.name === "up") {
                index = (index - 1 + items.length) % items.length;
                draw();
                return;
            }
            if (key.name === "down") {
                index = (index + 1) % items.length;
                draw();
                return;
            }
            if (key.name === "return") {
                cleanup();
                resolve(index);
                return;
            }
            if (key.name === "escape" || (key.ctrl && key.name === "c")) {
                cleanup();
                resolve(null);
            }
        };

        const cleanup = () => {
            stdin.off("keypress", onKey);
            stdin.setRawMode(Boolean(wasRaw));
        };

        stdin.on("keypress", onKey);
        draw();
    });
};

const runDmChat = async (service: ChatService, friend: any) => {
    console.clear();
    const history = await service.fetchDmHistory(friend.seed, {limit: 20});
    if (history.length > 0) {
        logTable(history);
    } else {
        logInfo("No messages yet");
    }

    const stop = await service.joinDm(friend.seed, {limit: 20});
    logInfo("Type message, /block, or /exit");
    try {
        while (true) {
            const input = (await prompt("> ")).trim();
            if (!input) {
                continue;
            }
            if (input === "/exit") {
                break;
            }
            if (input === "/block") {
                await service.manageConnection(
                    friend.seed,
                    iqlabs.contract.CONNECTION_STATUS_BLOCKED,
                );
                logInfo("Blocked");
                continue;
            }
            await service.sendDm(friend.seed, input);
        }
    } finally {
        stop();
    }
};

const runRoomChat = async (service: ChatService, room: any) => {
    console.clear();
    console.log(`[room] ${room.name}`);
    const history = await iqlabs.reader.readTableRows(room.table, {limit: 20});
    if (history.length > 0) {
        logTable(history);
    } else {
        logInfo("No messages yet");
    }

    const stop = await service.joinRoom(room.seed, {limit: 20});
    logInfo("Type message or /exit");
    try {
        while (true) {
            const input = (await prompt("> ")).trim();
            if (!input) {
                continue;
            }
            if (input === "/exit") {
                break;
            }
            await service.sendChat(room.seed, input);
        }
    } finally {
        stop();
    }
};

const handleFriendSelect = async (service: ChatService, friend: any) => {
    if (friend.status === "pending") {
        //TODO: this looks like when it approved, we join the chat, but we need to make manage friend list separate and allow user can block when it approved.
        // this means, we need to make the list that displays only approved friend list and blocked, pending and make the suitable choice in there.
        const choice = (await prompt("1) Approve  2) Block  3) Back: ")).trim();
        if (choice === "1") {
            await service.manageConnection(
                friend.seed,
                iqlabs.contract.CONNECTION_STATUS_APPROVED,
            );
            logInfo("Approved");
        } else if (choice === "2") {
            await service.manageConnection(
                friend.seed,
                iqlabs.contract.CONNECTION_STATUS_BLOCKED,
            );
            logInfo("Blocked");
        }
        return;
    }
    if (friend.status === "blocked") {
        const choice = (await prompt("1) Unblock  2) Back: ")).trim();
        if (choice === "1") {
            await service.manageConnection(
                friend.seed,
                iqlabs.contract.CONNECTION_STATUS_APPROVED,
            );
            logInfo("Unblocked");
        }
        return;
    }
    await runDmChat(service, friend);
};

const openFriendList = async (service: ChatService) => {
    const friends = await service.listFriends();
    if (friends.length === 0) {
        logInfo("No friends found");
        await prompt("Press Enter to continue...");
        return;
    }

    const index = await selectFromList("Friend List", friends, (friend, selected) => {
        const status = friend.status ?? "unknown";
        const marker = selected ? "*" : " ";
        return `${marker} ${friend.address} [${status}]`;
    });

    if (index === null) {
        return;
    }
    const friend = friends[index];
    await handleFriendSelect(service, friend);
    await prompt("Press Enter to continue...");
};

const requestConnection = async (service: ChatService) => {
    const input = (await prompt("Partner address: ")).trim();
    if (!input) {
        logError("Partner address is required");
        return;
    }
    let partner: PublicKey;
    try {
        partner = new PublicKey(input);
    } catch (err) {
        logError("Invalid partner address", err);
        await prompt("Press Enter to continue...");
        return;
    }
    if (partner.equals(service.signer.publicKey)) {
        logError("Cannot request connection with yourself");
        await prompt("Press Enter to continue...");
        return;
    }

    const result = await service.requestConnection(partner);
    const seedHex = Buffer.from(result.connectionSeed).toString("hex");
    if (result.created) {
        logInfo("Connection requested", {
            table: result.connectionTable.toBase58(),
            seed: seedHex,
            signature: result.signature ?? null,
        });
    } else {
        logInfo("Connection already exists", {
            table: result.connectionTable.toBase58(),
            seed: seedHex,
        });
    }
    await prompt("Press Enter to continue...");
};

const openRoomList = async (service: ChatService) => {
    const rooms = await service.listRooms();
    if (rooms.length === 0) {
        logInfo("No rooms found");
        await prompt("Press Enter to continue...");
        return;
    }

    const index = await selectFromList("Room List", rooms, (room, selected) => {
        const marker = selected ? "*" : " ";
        return `${marker} ${room.name}`;
    });
    if (index === null) {
        return;
    }
    await runRoomChat(service, rooms[index]);
    await prompt("Press Enter to continue...");
};

const createRoom = async (service: ChatService) => {
    const name = (await prompt("Room name: ")).trim();
    if (!name) {
        logError("Room name is required");
        return;
    }
    const result = await service.createRoom(name);
    if (result.created) {
        logInfo("Room created", {
            table: result.table.toBase58(),
            instructionTable: result.instructionTable.toBase58(),
            signature: result.signature ?? null,
        });
    } else {
        logInfo("Room already exists", {
            table: result.table.toBase58(),
            instructionTable: result.instructionTable.toBase58(),
        });
    }
    await prompt("Press Enter to continue...");
};

export const runChatCommand = async () => {
    const service = new ChatService();
    try {
        await service.setupCliDemo();
    } catch (err) {
        logError("Chat setup failed", err);
        await prompt("Press Enter to return...");
        return;
    }

    let running = true;
    while (running) {
        console.clear();
        showChatMenu();
        const choice = (await prompt("Select option: ")).trim();
        try {
            switch (choice) {
                case "1":
                    await openFriendList(service);
                    break;
                case "2":
                    await requestConnection(service);
                    break;
                case "3":
                    await openRoomList(service);
                    break;
                case "4":
                    await createRoom(service);
                    break;
                case "9":
                    running = false;
                    break;
                default:
                    logError("Invalid option");
                    await prompt("Press Enter to continue...");
            }
        } catch (err) {
            logError("Chat action failed", err);
            await prompt("Press Enter to continue...");
        }
    }
};
