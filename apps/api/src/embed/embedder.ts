/** Turns text into unit-length vectors; posts and queries are embedded differently. */
export interface Embedder {
  /** Stored on each chunk, so a model change triggers a re-embed. */
  readonly model: string;
  readonly dimensions: number;
  embedDocuments(texts: string[]): Promise<number[][]>;
  /** Applies the model's query instruction, which bge needs for short-query retrieval. */
  embedQuery(text: string): Promise<number[]>;
}
