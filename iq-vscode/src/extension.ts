import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SolGitService } from './git-service';

export function activate(context: vscode.ExtensionContext) {
    console.log('SolGit extension is active!');

    const outputChannel = vscode.window.createOutputChannel("SolGit");
    const gitService = new SolGitService(outputChannel);

    let initDisposable = vscode.commands.registerCommand('solgit.init', async () => {
        const name = await vscode.window.showInputBox({ prompt: "Repository Name" });
        if (name) {
            try {
                await gitService.initRepo(name);
                vscode.window.showInformationMessage(`Repo '${name}' initialized on Solana!`);
            } catch (e: any) {
                vscode.window.showErrorMessage("Init failed: " + e.message);
            }
        }
    });

    let commitDisposable = vscode.commands.registerCommand('solgit.commit', async () => {
        const message = await vscode.window.showInputBox({ prompt: "Commit Message" });
        if (message) {
            try {
                await gitService.commit(message);
                vscode.window.showInformationMessage(`Committed: ${message}`);
            } catch (e: any) {
                vscode.window.showErrorMessage("Commit failed: " + e.message);
            }
        }
    });

    let graphDisposable = vscode.commands.registerCommand('solgit.graph', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage("No workspace open");
            return;
        }

        const root = workspaceFolders[0].uri.fsPath;
        const configPath = path.join(root, '.solgit');
        
        // If not initialized, maybe ask user to pick from listRepos? 
        // For now, let's assume one repo per window context or we list all.
        let repoName = "";
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            repoName = config.repoName;
        } else {
            // Ask user to pick a repo to visualize
            const repos = await gitService.listRepos();
            const choice = await vscode.window.showQuickPick(repos.map((r: any) => r.name), {
                placeHolder: "Select repository to view graph"
            });
            if (!choice) return;
            repoName = choice;
        }

        const panel = vscode.window.createWebviewPanel(
            'solgitGraph',
            `SolGit: ${repoName}`,
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        // Fetch logs
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Fetching commit history...",
            cancellable: false
        }, async (progress) => {
            const commits = await gitService.getLog(repoName);
            panel.webview.html = getGraphHtml(repoName, commits);
        });
    });

    context.subscriptions.push(initDisposable);
    context.subscriptions.push(commitDisposable);
    context.subscriptions.push(graphDisposable);
}

function getGraphHtml(repoName: string, commits: any[]) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SolGit Graph</title>
        <style>
            body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); }
            h1 { color: var(--vscode-textLink-foreground); }
            .commit { padding: 10px; border-left: 2px solid var(--vscode-gitDecoration-addedResourceForeground); margin-bottom: 10px; position: relative; padding-left: 20px; }
            .commit::before {
                content: '';
                position: absolute;
                left: -6px;
                top: 15px;
                width: 10px;
                height: 10px;
                background: var(--vscode-gitDecoration-addedResourceForeground);
                border-radius: 50%;
            }
            .hash { font-family: monospace; color: var(--vscode-textLink-activeForeground); font-size: 0.9em; }
            .author { font-size: 0.8em; opacity: 0.8; margin-bottom: 4px; }
            .message { font-weight: bold; font-size: 1.1em; }
            .timestamp { font-size: 0.8em; opacity: 0.6; }
            .connector {
                position: absolute;
                left: -1px;
                top: 25px;
                bottom: -25px;
                width: 2px;
                background: var(--vscode-gitDecoration-addedResourceForeground);
            }
            .commit:last-child .connector { display: none; }
        </style>
    </head>
    <body>
        <h1>${repoName} History</h1>
        <div class="timeline">
            ${commits.length === 0 ? '<p>No commits found.</p>' : commits.map(c => `
                <div class="commit">
                    <div class="connector"></div>
                    <div class="message">${c.message}</div>
                    <div class="author">by ${c.author.slice(0,6)}...</div>
                    <div>
                        <span class="hash">${c.id.slice(0,8)}</span> 
                        <span class="timestamp">${new Date(c.timestamp).toLocaleString()}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    </body>
    </html>`;
}

export function deactivate() {}
