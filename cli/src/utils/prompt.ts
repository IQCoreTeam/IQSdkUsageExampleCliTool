import * as readline from "node:readline";

let rl: readline.Interface | null = null;

export const getReadline = () => {
    if (!rl) {
        rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
    }
    return rl;
};

export const prompt = (question: string): Promise<string> =>
    new Promise((resolve) => getReadline().question(question, resolve));

export const closeReadline = () => {
    if (rl) {
        rl.close();
        rl = null;
    }
};
