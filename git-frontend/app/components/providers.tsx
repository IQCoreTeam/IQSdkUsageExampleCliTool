"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import { useState, useEffect, useMemo } from "react";
import QueryProvider from "@/providers/QueryProvider";

// Default styles that can be overridden by your app
import "@solana/wallet-adapter-react-ui/styles.css";

import { Toaster } from 'sonner';

// @ts-ignore
import { iqlabs } from "@iqlabs-official/solana-sdk";

export function Providers({ children }: { children: React.ReactNode }) {
  const [endpoint, setEndpoint] = useState(() => {
    const envUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    if (envUrl) return envUrl;
    const cluster = (process.env.NEXT_PUBLIC_SOLANA_NETWORK as any) || "devnet";
    return clusterApiUrl(cluster);
  });

  useEffect(() => {
    iqlabs.setRpcUrl(endpoint);
  }, [endpoint]);

  // Wallets are implicitly detected by the Wallet Standard
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <QueryProvider>
            {children}
          </QueryProvider>
          <Toaster position="bottom-right" theme="dark" richColors />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
