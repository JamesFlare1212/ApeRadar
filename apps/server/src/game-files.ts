import { open } from 'node:fs/promises'

// Bound every read, including files replaced or appended while the game is running.
export async function readGameText(filename: string, maximumBytes: number, tail = false): Promise<{ text: string; modifiedAt: string }> {
  const file = await open(filename, 'r')
  try {
    const info = await file.stat()
    if (!info.isFile()) throw new Error('需要普通文件')
    if (!tail && info.size > maximumBytes) throw new Error('游戏配置文件过大')
    const length = Math.min(info.size, maximumBytes)
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await file.read(buffer, 0, length, tail ? Math.max(0, info.size - length) : 0)
    return { text: buffer.subarray(0, bytesRead).toString('utf8').replace(/^\uFEFF/, ''), modifiedAt: info.mtime.toISOString() }
  } finally { await file.close() }
}

// Game preferences allow element names that strict XML parsers reject. Read only
// the required section, ignore comments, and reject duplicate/ambiguous sections.
export function gameSection(text: string, names: string[]): string | null {
  let section = text.replace(/<!--[\s\S]*?-->/g, '')
  for (const name of names) {
    const matches = [...section.matchAll(new RegExp(`<${name}>\\s*([\\s\\S]*?)<\\/${name}\\s*>`, 'gi'))]
    if (matches.length !== 1) return null
    section = matches[0][1]
  }
  return section.trim()
}
