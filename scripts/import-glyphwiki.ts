import {spawn, execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {createReadStream, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {createInterface} from 'node:readline'
import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath} from 'node:url'

const archive = process.argv[2]
if (archive === undefined) throw new Error('Usage: node scripts/import-glyphwiki.ts /path/to/dump.tar.gz')
const root = fileURLToPath(new URL('../', import.meta.url))
const baseline: {target_codepoints: string[]} = JSON.parse(readFileSync(join(root, 'artifacts/coverage-baseline.json'), 'utf8'))
const targets = baseline.target_codepoints.map(value => Number.parseInt(value.slice(2), 16))
  .filter(cp => cp >= 0x4e00 && cp <= 0x9fff)
const temporary = mkdtempSync(join(tmpdir(), 'yono-glyphwiki-index-'))
const database = new DatabaseSync(join(temporary, 'glyphs.sqlite'))
try {
  database.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; CREATE TABLE glyphs (name TEXT PRIMARY KEY, data TEXT NOT NULL) WITHOUT ROWID;')
  const insert = database.prepare('INSERT OR REPLACE INTO glyphs(name, data) VALUES (?, ?)')
  for (const member of ['dump_newest_only.txt', 'dump_all_versions.txt']) {
    const child = spawn('tar', ['-xOf', resolve(archive), member], {stdio: ['ignore', 'pipe', 'inherit']})
    const done = new Promise<void>((accept, reject) => {
      child.once('error', reject)
      child.once('exit', code => code === 0 ? accept() : reject(new Error(`tar exited with ${code}`)))
    })
    database.exec('BEGIN')
    let rows = 0
    for await (const line of createInterface({input: child.stdout!})) {
      const fields = line.split('|')
      if (fields.length !== 3) continue
      const name = fields[0]!.trim().replaceAll('\\@', '@')
      const data = fields[2]!.trim()
      if (name === 'name' || !/^\d+:/.test(data)) continue
      insert.run(name, data)
      rows += 1
      if (rows % 200000 === 0) console.log(`${member}: indexed ${rows} records`)
    }
    await done
    database.exec('COMMIT')
    console.log(`${member}: ${rows} records complete`)
  }
  const get = database.prepare('SELECT data FROM glyphs WHERE name=?')
  const dataFor = (name: string): string | undefined => get.get(name)?.['data'] as string | undefined
  const selected = new Map<string, string>()
  const records = new Map<string, string>()
  const missing: string[] = []
  let mainland = 0
  function include(name: string, active: ReadonlySet<string>): void {
    if (active.has(name)) throw new Error(`Circular GlyphWiki component: ${[...active, name].join(' -> ')}`)
    if (records.has(name)) return
    const data = dataFor(name)
    if (data === undefined) throw new Error(`Missing pinned GlyphWiki component: ${name}`)
    records.set(name, data)
    const next = new Set([...active, name])
    for (const row of data.split('$')) {
      const fields = row.split(':')
      if (fields[0] === '99') include(fields[7]!, next)
    }
  }
  for (const cp of targets) {
    const canonical = 'u' + cp.toString(16)
    const regional = canonical + '-g'
    const name = dataFor(regional) !== undefined ? regional : canonical
    if (dataFor(name) === undefined) {
      missing.push('U+' + cp.toString(16).toUpperCase())
      continue
    }
    if (name === regional) mainland += 1
    selected.set(String.fromCodePoint(cp), name)
    include(name, new Set())
  }
  if (missing.length > 0) throw new Error(`Missing ${missing.length} target glyphs: ${missing.join(', ')}`)
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(archive)) hash.update(chunk)
  const sourceHash = hash.digest('hex')
  const output = join(root, 'sources/glyphwiki')
  const license = execFileSync('tar', ['-xOf', resolve(archive), 'LICENSE.txt'])
  const readme = execFileSync('tar', ['-xOf', resolve(archive), 'README_en.txt'])
  const data = {
    source_url: 'https://glyphwiki.org/dump.tar.gz',
    source_sha256: sourceHash,
    source_bytes: statSync(archive).size,
    target_count: targets.length,
    mainland_roots: mainland,
    canonical_roots: selected.size - mainland,
    selection: 'Prefer exact uXXXX-g, otherwise use the canonical uXXXX; preserve pinned component versions.',
    roots: Object.fromEntries(selected),
    glyphs: Object.fromEntries([...records].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)),
  }
  mkdirSync(output, {recursive: true})
  writeFileSync(join(output, 'LICENSE.txt'), license)
  writeFileSync(join(output, 'README_en.txt'), readme)
  writeFileSync(join(output, 'subset.json'), JSON.stringify(data) + '\n')
  console.log(JSON.stringify({targets: targets.length, mainland, canonical: selected.size - mainland, records: records.size, sourceHash}))
} finally {
  database.close()
  rmSync(temporary, {recursive: true, force: true})
}
