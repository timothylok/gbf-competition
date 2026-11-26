declare module 'subset-font' {
  /** Keep only the glyphs for the characters in `text`; returns the smaller font file. */
  export default function subsetFont(font: Buffer, text: string, options?: { targetFormat?: 'sfnt' | 'woff' | 'woff2' | 'truetype'; preserveNameIds?: number[] }): Promise<Buffer>
}
