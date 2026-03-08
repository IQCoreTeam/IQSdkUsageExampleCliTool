import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Connection, Keypair } from '@solana/web3.js';
import * as crypto from 'crypto';
// @ts-ignore
import iqlabs from 'iqlabs-sdk'; 
// Trying without /src/index to see if typescript resolution works with the file dependency structure.
// If it fails, I'll revert to /src/index or just cast.
// Actually, I'll use require since it's cleaner in Node without ESM if imports fail.
// But this is typescript file.
// Let's rely on the previous import but ignore the error or use the path that worked.
// App used: import iqlabs from "iqlabs-sdk/src";
// I'll stick to that.

const GIT_CONSTANTS = {
  REPOS_TABLE: "git_repos_v2",
  COMMITS_TABLE: "git_commits",
  REFS_TABLE: "git_refs",
  COLLABORATORS_TABLE: "git_collabs",
  FORKS_TABLE: "git_forks",
};

interface FileTree {
  [filePath: string]: {
    txId: string;
    hash: string;
  };
}

interface Commit {
  id: string;
  repoName: string;
  message: string;
  author: string;
  timestamp: number;
  treeTxId: string;
  parentCommitId?: string;
}

interface Repository {
    name: string;
    description: string;
    owner: string;
    timestamp: number;
    isPublic: boolean;
}

const sha256 = (input: string): Buffer => {
    return crypto.createHash("sha256").update(input).digest();
};

export class SolGitService {
    // ... existing ...

    async listRepos(): Promise<Repository[]> {
        const sdk = require('iqlabs-sdk/src/index').default;
        const tableSeed = sha256(GIT_CONSTANTS.REPOS_TABLE);
        const dbRoot = sdk.contract.getDbRootPda(this.dbRootId, this.programId);
        const table = sdk.contract.getTablePda(dbRoot, tableSeed, this.programId);
        
        try {
            const rows = await sdk.reader.readTableRows(table);
            return rows as unknown as Repository[];
        } catch {
            return [];
        }
    }

    async getLog(repoName: string): Promise<Commit[]> {
        const sdk = require('iqlabs-sdk/src/index').default;
        const tableSeed = sha256(GIT_CONSTANTS.COMMITS_TABLE);
        const dbRoot = sdk.contract.getDbRootPda(this.dbRootId, this.programId);
        const table = sdk.contract.getTablePda(dbRoot, tableSeed, this.programId);
        
        try {
            const rows: any[] = await sdk.reader.readTableRows(table);
            return (rows as unknown as Commit[])
                .filter(c => c.repoName === repoName)
                .sort((a, b) => b.timestamp - a.timestamp);
        } catch (e) {
            this.output.appendLine("Error fetching log: " + e);
            return [];
        }
    }

    private connection: Connection;
    private signer: Keypair;
    private output: vscode.OutputChannel;
    private programId: any; 
    private dbRootId: Buffer;

    constructor(output: vscode.OutputChannel) {
        this.output = output;
        
        // Config
        const rpc = "http://127.0.0.1:8899"; 
        this.connection = new Connection(rpc, "confirmed");
        this.dbRootId = sha256("iq-git-v1");

        // Load Wallet
        const home = process.env.HOME || process.env.USERPROFILE || "";
        const keyPath = path.join(home, ".config/solana/id.json");
        
        if (fs.existsSync(keyPath)) {
            try {
                const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
                this.signer = Keypair.fromSecretKey(new Uint8Array(keyData));
                this.output.appendLine(`Loaded wallet: ${this.signer.publicKey.toBase58()}`);
            } catch (e) {
                this.output.appendLine("Failed to parse wallet: " + e);
                // Create dummy for safety if needed, or throw
                throw e;
            }
        } else {
            this.output.appendLine("No wallet found at " + keyPath);
            throw new Error("Wallet not found");
        }

        // @ts-ignore
        const sdk = require('iqlabs-sdk/src/index');
        sdk.default.setRpcUrl(rpc);
        this.programId = sdk.default.contract.getProgramId();
    }

    async initRepo(name: string) {
        this.output.appendLine(`Creating repo ${name}...`);
        
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) throw new Error("No workspace open");
        
        const root = workspaceFolders[0].uri.fsPath;
        fs.writeFileSync(path.join(root, '.solgit'), JSON.stringify({ repoName: name }));
        
        // @ts-ignore
        const sdk = require('iqlabs-sdk/src/index').default;
        
        const tableSeed = sha256(GIT_CONSTANTS.REPOS_TABLE);
        
        const row = {
            name,
            description: "Initialized via VS Code",
            owner: this.signer.publicKey.toBase58(),
            timestamp: Date.now(),
            isPublic: true
        };
        
        await sdk.writer.writeRow(
            this.connection,
            this.signer,
            this.dbRootId,
            tableSeed,
            JSON.stringify(row)
        );
        this.output.appendLine("Repo created on chain!");
    }

    async commit(message: string) {
        // @ts-ignore
        const sdk = require('iqlabs-sdk/src/index').default;

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) throw new Error("No workspace open");
        const root = workspaceFolders[0].uri.fsPath;
        
        // Read .solgit
        const configPath = path.join(root, '.solgit');
        if (!fs.existsSync(configPath)) throw new Error("Not a SolGit repo. Run 'SolGit: Init' first.");
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const repoName = config.repoName;
        
        this.output.appendLine(`Committing to ${repoName}...`);
        
        // 1. Scan files
        const files = await vscode.workspace.findFiles('**/*', '{.git,node_modules,out,dist,.solgit}');
        const fileData: {path: string, content: string}[] = [];
        
        for (const uri of files) {
           const relPath = path.relative(root, uri.fsPath).replace(/\\/g, '/');
           const content = fs.readFileSync(uri.fsPath).toString('base64');
           fileData.push({ path: relPath, content: content });
        }
        
        this.output.appendLine(`Found ${fileData.length} files.`);
        
        // 2. Build Tree & Upload
        const fileTree: FileTree = {};
        
        for (const f of fileData) {
            this.output.appendLine(`Uploading ${f.path}...`);
            const chunks = this.chunkString(f.content, 100 * 1024);
            if (chunks.length === 0) chunks.push("");
            
            const hash = crypto.createHash('sha256').update(f.content).digest('hex');
             
            // Upload
            const txId = await sdk.writer.codeIn(
                 { connection: this.connection, signer: this.signer },
                 chunks,
                 undefined,
                 path.basename(f.path),
                 0,
                 "application/octet-stream"
            );
            
            fileTree[f.path] = { txId, hash };
        }
        
        // 3. Upload Tree
        const treeJson = JSON.stringify(fileTree);
        const treeTxId = await sdk.writer.codeIn(
             { connection: this.connection, signer: this.signer },
             this.chunkString(treeJson, 100 * 1024),
             undefined,
             "tree.json",
             0,
             "application/json"
        );
        
        // 4. Write Commit
        const commit = {
             id: crypto.randomUUID(),
             repoName,
             message,
             author: this.signer.publicKey.toBase58(),
             timestamp: Date.now(),
             treeTxId
        };
        
        const tableSeed = sha256(GIT_CONSTANTS.COMMITS_TABLE);
        
        await sdk.writer.writeRow(
             this.connection,
             this.signer,
             this.dbRootId,
             tableSeed,
             JSON.stringify(commit)
        );
        
        this.output.appendLine("Commit successful!");
    }
    
    private chunkString(str: string, size: number): string[] {
        const numChunks = Math.ceil(str.length / size);
        const chunks = new Array(numChunks);
        for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
            chunks[i] = str.substr(o, size);
        }
        return chunks;
    }
}
