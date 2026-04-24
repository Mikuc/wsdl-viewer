#!/usr/bin/env node
import { readdir, readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, basename, dirname, relative } from 'path'
import { createHash } from 'crypto'
import { fileURLToPath } from 'url'

const SERVICES_DIR = fileURLToPath(new URL('../services/', import.meta.url))
const METADATA_FILE = fileURLToPath(new URL('../services.json', import.meta.url))
const XSL_PATH = fileURLToPath(new URL('../vendor/wsdl-viewer/wsdl-viewer.xsl', import.meta.url))
const STYLESHEET_PI = '<?xml-stylesheet type="text/xsl" href="../vendor/wsdl-viewer/wsdl-viewer.xsl"?>'

if (!existsSync(XSL_PATH)) {
  console.error('ERROR: vendor/wsdl-viewer/wsdl-viewer.xsl not found.')
  console.error('Run: npm run setup')
  process.exit(1)
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const sourceDir = args.find(a => !a.startsWith('--'))

if (!sourceDir) {
  console.error('Usage: npm run import -- <path-to-wsdl-dir> [--dry-run]')
  process.exit(1)
}

async function findWsdlFiles(dir) {
  const results = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...await findWsdlFiles(full))
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.wsdl')) {
      results.push(full)
    }
  }
  return results
}

function extractServiceName(content, filePath) {
  // 1. Try <definitions name="..."> or <wsdl:definitions name="...">
  const defMatch = content.match(/<(?:wsdl:)?definitions[^>]+\bname="([^"]+)"/)
  if (defMatch) return sanitize(defMatch[1])

  // 2. Try <service name="...">
  const svcMatch = content.match(/<(?:wsdl:)?service[^>]+\bname="([^"]+)"/)
  if (svcMatch) return sanitize(svcMatch[1])

  // 3. Use parent directory name if file is generic
  const fileName = basename(filePath, '.wsdl').toLowerCase()
  const genericNames = ['generated', 'service', 'wsdl', 'api', 'schema']
  if (genericNames.includes(fileName)) {
    return sanitize(basename(dirname(filePath)))
  }

  // 4. Use filename
  return sanitize(basename(filePath, '.wsdl'))
}

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
}

function uniqueName(name, existing) {
  if (!existing.has(name)) return name
  let i = 2
  while (existing.has(`${name}_${i}`)) i++
  return `${name}_${i}`
}

function injectStylesheet(content) {
  // Insert after <?xml ...?> declaration if present, otherwise at top
  const xmlDeclMatch = content.match(/^(<\?xml[^?]*\?>)(\r?\n)?/)
  if (xmlDeclMatch) {
    const end = xmlDeclMatch[0].length
    return content.slice(0, end) + STYLESHEET_PI + '\n' + content.slice(end)
  }
  return STYLESHEET_PI + '\n' + content
}

function checksum(content) {
  return createHash('md5').update(content).digest('hex')
}

async function loadMetadata() {
  if (existsSync(METADATA_FILE)) {
    const raw = await readFile(METADATA_FILE, 'utf8')
    return JSON.parse(raw)
  }
  return {}
}

async function saveMetadata(meta) {
  await writeFile(METADATA_FILE, JSON.stringify(meta, null, 2), 'utf8')
}

async function main() {
  const { isAbsolute, resolve } = await import('path')
  const resolvedSource = isAbsolute(sourceDir) ? sourceDir : resolve(process.cwd(), sourceDir)

  if (!existsSync(resolvedSource)) {
    console.error(`Directory not found: ${resolvedSource}`)
    process.exit(1)
  }

  console.log(`Scanning: ${resolvedSource}${dryRun ? '  [DRY RUN]' : ''}`)
  const files = await findWsdlFiles(resolvedSource)

  if (files.length === 0) {
    console.log('No .wsdl files found.')
    return
  }

  console.log(`Found ${files.length} WSDL file(s)\n`)

  const metadata = await loadMetadata()
  const usedNames = new Set(Object.values(metadata).map(m => m.outputName))
  const results = []

  for (const filePath of files) {
    const content = await readFile(filePath, 'utf8')
    const hash = checksum(content)

    // Check if already imported and unchanged
    const existingEntry = Object.values(metadata).find(m => m.sourcePath === filePath)
    if (existingEntry && existingEntry.checksum === hash) {
      console.log(`  SKIP  ${relative(resolvedSource, filePath)} (unchanged)`)
      continue
    }

    const rawName = extractServiceName(content, filePath)
    const outputName = uniqueName(rawName, usedNames)
    usedNames.add(outputName)

    const outputFile = join(SERVICES_DIR, `${outputName}.xml`)
    const modified = injectStylesheet(content)

    const status = existingEntry ? 'UPDATE' : 'ADD'
    console.log(`  ${status.padEnd(6)} ${relative(resolvedSource, filePath)}  →  services/${outputName}.xml`)

    results.push({ filePath, outputName, outputFile, modified, hash })
  }

  if (results.length === 0) {
    console.log('\nNothing to do — all files up to date.')
    return
  }

  if (dryRun) {
    console.log('\n[DRY RUN] No files written.')
    return
  }

  await mkdir(SERVICES_DIR, { recursive: true })

  for (const { filePath, outputName, outputFile, modified, hash } of results) {
    await writeFile(outputFile, modified, 'utf8')
    metadata[outputName] = {
      outputName,
      sourcePath: filePath,
      importedAt: new Date().toISOString(),
      checksum: hash,
    }
  }

  await saveMetadata(metadata)
  console.log(`\nDone. ${results.length} file(s) written to services/`)
}

main().catch(err => { console.error(err); process.exit(1) })
