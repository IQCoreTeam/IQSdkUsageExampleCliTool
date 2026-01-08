'use client'

import { useState, useRef, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import * as sdk from 'iqlabs-sdk/src/sdk';

type State =
  | 'main'
  | 'file-menu'
  | 'inscribe-type'
  | 'inscribe-text'
  | 'inscribe-filename'
  | 'inscribe-filetype'
  | 'fetch'
  | 'sessions'
  | 'files'
  | 'files-limit'
  | 'files-before';

// Wrapper to ensure client-only rendering
export default function Page() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="terminal">
        <div className="header">
          <span>iqlabs</span>
          <button className="wallet-placeholder">Loading...</button>
        </div>
        <div className="output">Loading...</div>
      </div>
    );
  }

  return <Terminal />;
}

function Terminal() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [lines, setLines] = useState<string[]>([]);
  const [state, setState] = useState<State>('main');
  const [input, setInput] = useState('');
  const [temp, setTemp] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const print = useCallback((...msgs: string[]) => setLines(l => [...l, ...msgs]), []);
  const clear = useCallback(() => setLines([]), []);

  const showMainMenu = useCallback(() => {
    clear();
    print(
      '',
      '============================',
      '       IQLabs CLI Tool      ',
      '============================',
      '',
      '  1) File I/O (Write/Read)',
      '  2) SolChat',
      '  3) Exit',
      '',
      '============================',
      ''
    );
    setState('main');
    setTemp({});
  }, [clear, print]);

  const showFileMenu = useCallback(() => {
    clear();
    print(
      '',
      '============================',
      '       File Manager         ',
      '============================',
      '',
      '  1) Inscribe file/string',
      '  2) Fetch inscription by signature',
      '  3) List session files',
      '  4) List all files',
      '  5) Back',
      '',
      '============================',
      ''
    );
    setState('file-menu');
    setTemp({});
  }, [clear, print]);

  useEffect(() => {
    showMainMenu();
  }, [showMainMenu]);

  useEffect(() => {
    outputRef.current?.scrollTo(0, outputRef.current.scrollHeight);
  }, [lines]);

  const handle = async (val: string) => {
    const v = val.trim();
    print(`> ${v}`);

    if (state === 'main') {
      if (v === '1') {
        showFileMenu();
      } else if (v === '2') {
        clear();
        print(
          '',
          '============================',
          '          SolChat           ',
          '============================',
          '',
          '[SolChat - Coming Soon]',
          '',
          'Press Enter to return to main menu...'
        );
        setTemp({ wait: 'main' });
      } else if (v === '3') {
        clear();
        print('', 'Goodbye!', '');
      } else {
        print('', 'Invalid option', '', 'Press Enter to continue...');
        setTemp({ wait: 'main' });
      }
      return;
    }

    if (state === 'file-menu') {
      if (v === '1') {
        print('', '--- Inscribe ---', '', '  1) File', '  2) Text', '');
        setState('inscribe-type');
      } else if (v === '2') {
        print('', '--- Fetch Inscription ---', '', 'Transaction signature:');
        setState('fetch');
      } else if (v === '3') {
        print('', '--- List Session Files ---', '');
        const defaultPubkey = wallet.publicKey?.toBase58() || 'connect wallet';
        print(`User pubkey [${defaultPubkey}]:`);
        setState('sessions');
      } else if (v === '4') {
        print('', '--- List All Files ---', '', 'DB PDA address:');
        setState('files');
      } else if (v === '5') {
        showMainMenu();
      } else {
        print('Invalid option', '', 'Press Enter to continue...');
        setTemp({ wait: 'file' });
      }
      return;
    }

    if (state === 'inscribe-type') {
      if (v === '1') {
        print('File upload not supported in browser. Use text instead.');
        print('', 'Press Enter to continue...');
        setTemp({ wait: 'file' });
      } else if (v === '2') {
        print('Text to inscribe:');
        setState('inscribe-text');
      } else {
        print('Invalid option');
        print('', 'Press Enter to continue...');
        setTemp({ wait: 'file' });
      }
      return;
    }

    if (state === 'inscribe-text') {
      if (!v) {
        print('No text provided');
        print('', 'Press Enter to continue...');
        setTemp({ wait: 'file' });
        return;
      }
      setTemp({ text: v });
      print('Filename (optional):');
      setState('inscribe-filename');
      return;
    }

    if (state === 'inscribe-filename') {
      setTemp({ ...temp, filename: v });
      print('Filetype (optional):');
      setState('inscribe-filetype');
      return;
    }

    if (state === 'inscribe-filetype') {
      const filetype = v || '';
      if (!wallet.publicKey || !wallet.signTransaction) {
        print('Connect wallet first');
        print('', 'Press Enter to continue...');
        setTemp({ wait: 'file' });
        return;
      }
      print('Chunking...');
      const chunks = [];
      for (let i = 0; i < temp.text.length; i += 900) {
        chunks.push(temp.text.slice(i, i + 900));
      }
      print(`Chunks: ${chunks.length}`);
      print('Uploading...');
      try {
        const sig = await sdk.writer.codein(
          { connection, signer: wallet },
          chunks,
          false,
          temp.filename || undefined,
          0,
          filetype
        );
        print(`Signature: ${sig}`);
      } catch (e) {
        print(`Inscribe failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      print('', 'Press Enter to continue...');
      setTemp({ wait: 'file' });
      return;
    }

    if (state === 'fetch') {
      if (!v) {
        print('No signature provided');
        print('', 'Press Enter to continue...');
        setTemp({ wait: 'file' });
        return;
      }
      print('Reading metadata...');
      try {
        const meta = await sdk.reader.readDBMetadata(v);
        print(`Path: ${meta.onChainPath}`);
        print(`Metadata: ${meta.metadata}`);
        print('Reading content...');
        const { data } = await sdk.reader.readCodeIn(v);
        if (data === null) {
          print('Content unavailable (replay requested)');
        } else {
          print('', '--- Content ---');
          print(data.length > 500 ? data.slice(0, 500) + '...[truncated]' : data);
          print('--- End ---', '');
        }
      } catch (e) {
        print(`Read failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      print('', 'Press Enter to continue...');
      setTemp({ wait: 'file' });
      return;
    }

    if (state === 'sessions') {
      const addr = v || wallet.publicKey?.toBase58();
      if (!addr) {
        print('No address provided');
        print('', 'Press Enter to continue...');
        setTemp({ wait: 'file' });
        return;
      }
      print(`Fetching sessions for: ${addr}`);
      try {
        const list = await sdk.reader.getSessionPdaList(addr);
        if (list.length === 0) {
          print('No sessions found');
        } else {
          list.forEach((s: string) => print(s));
        }
      } catch (e) {
        print(`List sessions failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      print('', 'Press Enter to continue...');
      setTemp({ wait: 'file' });
      return;
    }

    if (state === 'files') {
      if (!v) {
        print('No PDA provided');
        print('', 'Press Enter to continue...');
        setTemp({ wait: 'file' });
        return;
      }
      setTemp({ pda: v });
      print('Limit [10]:');
      setState('files-limit');
      return;
    }

    if (state === 'files-limit') {
      setTemp({ ...temp, limit: v });
      print('Before signature (optional):');
      setState('files-before');
      return;
    }

    if (state === 'files-before') {
      const limit = parseInt(temp.limit) || 10;
      const before = v || undefined;
      print(`Fetching transactions for: ${temp.pda}`);
      try {
        const list = await sdk.reader.fetchAccountTransactions(temp.pda, { limit, before });
        if (list.length === 0) {
          print('No transactions found');
        } else {
          list.forEach((tx: { signature: string; slot: number; err: unknown; memo?: string }) => {
            const sig = tx.signature;
            const memo = tx.memo ?? '';
            print(`${sig}  slot:${tx.slot}  ${tx.err ? 'error' : 'ok'}  ${memo}`);
          });
        }
      } catch (e) {
        print(`Fetch transactions failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      print('', 'Press Enter to continue...');
      setTemp({ wait: 'file' });
      return;
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (temp.wait === 'main') {
      showMainMenu();
      return;
    }
    if (temp.wait === 'file') {
      showFileMenu();
      return;
    }
    handle(input);
    setInput('');
  };

  const getPrompt = () => {
    if (state === 'main' || state === 'file-menu') return 'Select option: ';
    if (state === 'inscribe-type') return 'Select input type: ';
    return '> ';
  };

  return (
    <div className="terminal" onClick={() => inputRef.current?.focus()}>
      <div className="header">
        <span>iqlabs</span>
        <WalletMultiButton />
      </div>
      <div className="output" ref={outputRef}>
        {lines.map((line, i) => <div key={i}>{line}</div>)}
        <form onSubmit={submit} className="input-line">
          <span className="prompt">{getPrompt()}</span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            autoFocus
            spellCheck={false}
          />
        </form>
      </div>
    </div>
  );
}
