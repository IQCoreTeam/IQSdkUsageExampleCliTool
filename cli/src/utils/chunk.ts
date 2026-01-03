import fs from "node:fs";

export const DEFAULT_CHUNK_SIZE = 900;

export const chunkString = (
  value: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
) => {
  if (value.length === 0) {
    return [];
  }
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += chunkSize) {
    chunks.push(value.slice(index, index + chunkSize));
  }
  return chunks;
};

export const resolveChunks = (
  source: string[] | string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
) => {
  if (Array.isArray(source)) {
    return source;
  }
  const data = fs.existsSync(source)
    ? fs.readFileSync(source, "utf8")
    : source;
  return chunkString(data, chunkSize);
};
