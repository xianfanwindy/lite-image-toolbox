const fs = require('node:fs')
const path = require('node:path')

const RUNTIME_DIRECTORIES = ['pages', 'utils', 'components', 'config']
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.upstream-tools-applet',
  'node_modules',
  'miniprogram_npm',
])

const PATTERNS = [
  { label: 'wx.uploadFile', expression: /\bwx\s*(?:\?\s*)?\.\s*uploadFile\b|\bwx\s*(?:\?\s*)?\[\s*(['"])uploadFile\1\s*\]/g },
  { label: 'wx.downloadFile', expression: /\bwx\s*(?:\?\s*)?\.\s*downloadFile\b|\bwx\s*(?:\?\s*)?\[\s*(['"])downloadFile\1\s*\]/g },
  { label: 'wx.request', expression: /\bwx\s*(?:\?\s*)?\.\s*request\b|\bwx\s*(?:\?\s*)?\[\s*(['"])request\1\s*\]/g },
  { label: 'wx.cloud', expression: /\bwx\s*(?:\?\s*)?\.\s*cloud\b|\bwx\s*(?:\?\s*)?\[\s*(['"])cloud\1\s*\]/g },
  { label: 'http://', expression: /http:\/\//g },
  { label: 'https://', expression: /https:\/\//g },
]

function relativeFile(root, file) {
  return path.relative(root, file).split(path.sep).join('/')
}

function isWithinRoot(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function assertSafePath(root, file, label) {
  const stats = fs.lstatSync(file)
  if (stats.isSymbolicLink()) {
    throw new Error(`Unsafe symbolic link in runtime ${label}: ${file}`)
  }

  const realPath = fs.realpathSync(file)
  if (!isWithinRoot(root, realPath)) {
    throw new Error(`Runtime path escapes root boundary: ${file}`)
  }
  return stats
}

function stripComments(source) {
  const characters = source.split('')
  let state = 'code'
  let quote = ''
  let escaped = false

  const blank = (index) => {
    if (characters[index] !== '\r' && characters[index] !== '\n') {
      characters[index] = ' '
    }
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]

    if (state === 'line-comment') {
      if (character === '\r' || character === '\n') {
        state = 'code'
      } else {
        blank(index)
      }
      continue
    }

    if (state === 'block-comment') {
      if (character === '*' && source[index + 1] === '/') {
        blank(index)
        blank(index + 1)
        index += 1
        state = 'code'
      } else {
        blank(index)
      }
      continue
    }

    if (state === 'string') {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === quote) {
        state = 'code'
        quote = ''
      }
      continue
    }

    if (character === "'" || character === '"' || character === '`') {
      state = 'string'
      quote = character
      escaped = false
    } else if (character === '/' && source[index + 1] === '/' &&
      source.slice(Math.max(0, index - 6), index) !== 'https:' &&
      source.slice(Math.max(0, index - 5), index) !== 'http:') {
      blank(index)
      blank(index + 1)
      index += 1
      state = 'line-comment'
    } else if (character === '/' && source[index + 1] === '*') {
      blank(index)
      blank(index + 1)
      index += 1
      state = 'block-comment'
    }
  }

  return characters.join('')
}

function collectJavaScriptFiles(root, directory, files) {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
  entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)

  for (const entry of entries) {
    const file = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      throw new Error(`Unsafe symbolic link in runtime tree: ${file}`)
    }

    const stats = assertSafePath(root, file, 'tree entry')
    if (stats.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) {
        collectJavaScriptFiles(root, file, files)
      }
    } else if (stats.isFile() && path.extname(entry.name).toLowerCase() === '.js') {
      files.push({ absolute: file, relative: relativeFile(root, file) })
    }
  }
}

function resolveRuntimeRoot(root) {
  const resolvedRoot = path.resolve(root)
  let stats
  try {
    stats = fs.lstatSync(resolvedRoot)
  } catch (error) {
    throw new Error(`Invalid runtime root: ${resolvedRoot}`)
  }
  if (stats.isSymbolicLink()) {
    throw new Error(`Unsafe symbolic link in runtime root: ${resolvedRoot}`)
  }
  if (!stats.isDirectory()) {
    throw new Error(`Invalid runtime root: ${resolvedRoot}`)
  }

  const realRoot = fs.realpathSync(resolvedRoot)
  return { resolvedRoot, realRoot }
}

function lstatIfPresent(file) {
  try {
    return fs.lstatSync(file)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function lineNumberAt(lineStarts, index) {
  let low = 0
  let high = lineStarts.length
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2)
    if (lineStarts[middle] <= index) low = middle
    else high = middle
  }
  return low + 1
}

function scanSource(file, source) {
  const sanitized = stripComments(source)
  const lineStarts = [0]
  for (let index = 0; index < sanitized.length; index += 1) {
    if (sanitized[index] === '\n') lineStarts.push(index + 1)
  }

  const violations = []
  const seen = new Set()
  PATTERNS.forEach((pattern, patternOrder) => {
    pattern.expression.lastIndex = 0
    let match
    while ((match = pattern.expression.exec(sanitized)) !== null) {
      const line = lineNumberAt(lineStarts, match.index)
      const key = `${file.relative}\0${line}\0${pattern.label}`
      if (!seen.has(key)) {
        seen.add(key)
        violations.push({ file: file.relative, line, pattern: pattern.label, patternOrder })
      }
    }
    pattern.expression.lastIndex = 0
  })
  return violations
}

function scanFiles(root) {
  const { resolvedRoot, realRoot } = resolveRuntimeRoot(root)
  const files = []
  let hasRuntimeEntry = false
  const appFile = path.join(resolvedRoot, 'app.js')

  if (lstatIfPresent(appFile)) {
    const appStats = assertSafePath(realRoot, appFile, 'entry')
    if (!appStats.isFile()) throw new Error(`Runtime entry is not a file: ${appFile}`)
    files.push({ absolute: appFile, relative: 'app.js' })
    hasRuntimeEntry = true
  }

  for (const directoryName of RUNTIME_DIRECTORIES) {
    const directory = path.join(resolvedRoot, directoryName)
    if (!lstatIfPresent(directory)) continue
    const directoryStats = assertSafePath(realRoot, directory, 'directory')
    if (!directoryStats.isDirectory()) throw new Error(`Runtime directory is not a directory: ${directory}`)
    hasRuntimeEntry = true
    collectJavaScriptFiles(realRoot, directory, files)
  }

  if (!hasRuntimeEntry) {
    throw new Error(`Invalid runtime root: ${resolvedRoot} has no runtime entry`)
  }

  files.sort((left, right) => left.relative < right.relative ? -1 : left.relative > right.relative ? 1 : 0)
  const violations = files.flatMap((file) => scanSource(file, fs.readFileSync(file.absolute, 'utf8')))
  violations.sort((left, right) => {
    if (left.file !== right.file) return left.file < right.file ? -1 : 1
    if (left.line !== right.line) return left.line - right.line
    return left.patternOrder - right.patternOrder
  })
  return violations.map(({ file, line, pattern }) => ({ file, line, pattern }))
}

if (require.main === module) {
  try {
    const violations = scanFiles(process.cwd())
    if (violations.length === 0) {
      console.log('禁止运行时网络能力检查通过')
    } else {
      for (const violation of violations) {
        console.log(`${violation.file}:${violation.line}: 禁止使用 ${violation.pattern}`)
      }
      process.exitCode = 1
    }
  } catch (error) {
    console.error(`禁止运行时网络能力检查失败: ${error.message}`)
    process.exitCode = 1
  }
}

module.exports = { scanFiles }
