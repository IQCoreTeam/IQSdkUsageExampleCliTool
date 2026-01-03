//here to use code in . (session and linkedlist is handled inside on sdk  we only need to use code in here. )
// writer and reader function both needd to be here.
///Users/sumin/WebstormProjects/iqlabs-core-api/new_backend 여기에 레거시 버전이 있다.

// 그리고 새로운 업데이트는
///Users/sumin/RustroverProjects/IQLabsContract 이 곳에 있는데, updates.txt를 보면 변경사항을 볼수있음
import fs from "node:fs";

import type {Connection, Signer} from "@solana/web3.js";
import {reader, writer} from "iqlabs-sdk";

const DEFAULT_CHUNK_SIZE = 900;

const chunkString = (value: string, chunkSize: number) => {
  if (value.length === 0) {
    return [];
  }
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += chunkSize) {
    chunks.push(value.slice(index, index + chunkSize));
  }
  return chunks;
};

const resolveChunks = (source: string[] | string) => {
  if (Array.isArray(source)) {
    return source;
  }
  const data = fs.existsSync(source)
    ? fs.readFileSync(source, "utf8")
    : source;
  return chunkString(data, DEFAULT_CHUNK_SIZE);
};
// shall we put the chunk on the sdk ? if thats more clean

export async function inscribe(input: {
  connection: Connection;
  signer: Signer;
  chunks: string[] | string;
  filename?: string;
  filetype?: string;
  method?: number;
  isAnchor?: boolean;
}): Promise<string> {
  const {connection, signer, chunks, filename, filetype, method, isAnchor} =
    input;
  const resolvedChunks = resolveChunks(chunks);
  if (resolvedChunks.length === 0) {
    throw new Error("inscribe input is empty");
  }
  return writer.codein(
    {connection, signer},
    resolvedChunks,
    isAnchor ?? true,
    filename,
    method ?? 0,
    filetype ?? "",
  );
}

export async function readInscription(signature: string): Promise<{
  result: string | null;
}> {
  return reader.readInscription(signature);
}
