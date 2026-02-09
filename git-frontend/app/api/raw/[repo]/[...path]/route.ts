
import { NextRequest, NextResponse } from "next/server";
import { GitChainService } from "@/services/git/git-chain-service";
import { Connection, clusterApiUrl } from "@solana/web3.js";
import { Repository, Commit, FileTree } from "@/services/git/types";

// We need a connection instance on the server side
// Note: In a real app we might use a dedicated RPC endpoint env var
// @ts-ignore
import { iqlabs } from "@iqlabs-official/solana-sdk";

const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl((process.env.NEXT_PUBLIC_SOLANA_NETWORK as any) || "devnet");
const connection = new Connection(endpoint);
iqlabs.setRpcUrl(endpoint);

// We need a read-only wallet adapter dummy since we are just reading
const dummyWallet = {
    publicKey: null,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs
};

// ============================================
// SERVER-SIDE CACHING LAYER
// ============================================

// Simple LRU-like cache with TTL
interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

class ServerCache<T> {
    private cache = new Map<string, CacheEntry<T>>();
    private maxSize: number;
    private ttlMs: number;

    constructor(maxSize = 500, ttlMs = 5 * 60 * 1000) { // 5 min default TTL
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
    }

    get(key: string): T | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;

        // Check if expired
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            return undefined;
        }

        return entry.data;
    }

    set(key: string, data: T): void {
        // Evict oldest entries if at capacity
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
        }

        this.cache.set(key, { data, timestamp: Date.now() });
    }
}

// Initialize caches (these persist in Node.js memory between requests)
const reposCache = new ServerCache<Repository[]>(10, 60 * 1000); // 1 min TTL for repos
const commitsCache = new ServerCache<Commit[]>(100, 30 * 1000); // 30s TTL for commits
const treeCache = new ServerCache<FileTree>(200, 10 * 60 * 1000); // 10 min TTL for trees (immutable)
const fileCache = new ServerCache<string>(500, 10 * 60 * 1000); // 10 min TTL for files (immutable)

// ============================================

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ repo: string; path: string[] }> }
) {
    // Next.js 15+: params is now a Promise
    const { repo: repoName, path } = await context.params;
    const filePath = path.join("/");

    console.log(`[Raw API] Requesting: ${repoName}/${filePath}`);

    try {
        const gitService = new GitChainService(connection, dummyWallet);

        // 1. Get Repos (with caching)
        let repos = reposCache.get("all");
        if (!repos) {
            repos = await gitService.listRepos();
            reposCache.set("all", repos);
        }

        const repository = repos.find(r => r.name === repoName);

        if (!repository) {
            console.error(`[Raw API] Repository not found: ${repoName}`);
            return new NextResponse("Repository not found", { status: 404 });
        }

        // 2. Get Commits (with caching)
        let logs = commitsCache.get(repoName);
        if (!logs) {
            logs = await gitService.getLog(repoName);
            commitsCache.set(repoName, logs);
        }

        if (logs.length === 0) {
            console.error(`[Raw API] Repository empty: ${repoName}`);
            return new NextResponse("Repository is empty", { status: 404 });
        }

        const latestCommit = logs[0];
        console.log(`[Raw API] Latest commit: ${latestCommit.id}, Tree: ${latestCommit.treeTxId}`);

        // 3. Get Tree (with caching - trees are immutable!)
        let tree = treeCache.get(latestCommit.treeTxId);
        if (!tree) {
            tree = await gitService.getTree(latestCommit.treeTxId);
            treeCache.set(latestCommit.treeTxId, tree);
        }

        // 4. Find file
        // Support for "folder/" -> "folder/index.html" could be added here
        let targetPath = filePath;
        let fileNode = tree[targetPath];

        if (!fileNode) {
            // Try index.html if it's a directory-like request (though path usually includes filename)
            // or if exact match failed
            console.warn(`[Raw API] File not found at ${targetPath}. Tree keys: ${Object.keys(tree).join(', ')}`);
            return new NextResponse(`File not found: ${targetPath}`, { status: 404 });
        }

        if (!fileNode.txId) {
            return new NextResponse(`Invalid file node for: ${targetPath}`, { status: 500 });
        }

        // 5. Check public/private
        if (!repository.isPublic) {
            return new NextResponse("SolGit Pages not available for private repositories.", { status: 403 });
        }

        // 6. Get File Content (with caching - files are immutable!)
        let content = fileCache.get(fileNode.txId);
        if (!content) {
            console.log(`[Raw API] Fetching content from chain: ${fileNode.txId}`);
            content = await gitService.getFileContent(fileNode.txId);
            // Verify content is valid string
            if (typeof content !== 'string') {
                console.warn(`[Raw API] Content was not a string: ${typeof content}`);
                content = String(content);
            }
            if (!content) {
                console.warn(`[Raw API] Content empty for ${fileNode.txId}`);
            }
            fileCache.set(fileNode.txId, content);
        }

        // 7. Determine MIME type
        const ext = targetPath.split('.').pop()?.toLowerCase();
        let contentType = "text/plain";
        if (ext === "html") contentType = "text/html";
        else if (ext === "js") contentType = "application/javascript";
        else if (ext === "css") contentType = "text/css";
        else if (ext === "json") contentType = "application/json";
        else if (ext === "png") contentType = "image/png";
        else if (ext === "jpg" || ext === "jpeg") contentType = "image/jpeg";
        else if (ext === "gif") contentType = "image/gif";
        else if (ext === "svg") contentType = "image/svg+xml";
        else if (ext === "woff" || ext === "woff2") contentType = "font/woff2";
        else if (ext === "ico") contentType = "image/x-icon";

        return new NextResponse(content, {
            headers: {
                "Content-Type": contentType,
                // Aggressive caching - files are content-addressed (immutable)
                "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
                "X-Cache": fileCache.get(fileNode.txId) ? "HIT" : "MISS"
            }
        });

    } catch (e: any) {
        console.error("[Raw API] Error:", e);
        return new NextResponse("Internal Server Error: " + e.message, { status: 500 });
    }
}
