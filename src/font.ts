import {Font, woff2} from 'fonteditor-core'
import type {TTF} from 'fonteditor-core'

export function readFont(data: Buffer): TTF.TTFObject {
  return Font.create(data, {type: 'ttf', hinting: true, kerning: true}).get()
}

export async function encodeWoff2(ttf: Buffer): Promise<Buffer> {
  await woff2.init()
  const output = Buffer.from(woff2.encode(ttf))
  if (output.length === 0) throw new Error('WOFF2 encoding failed')
  return output
}

export async function decodeWoff2(data: Buffer): Promise<Buffer> {
  await woff2.init()
  const output = Buffer.from(woff2.decode(data))
  if (output.length === 0) throw new Error('WOFF2 decoding failed')
  return output
}
