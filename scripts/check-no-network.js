const fs = require('node:fs')
const path = require('node:path')

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.upstream-tools-applet',
  'node_modules',
  'miniprogram_npm',
])

const PATTERNS = [
  { label: 'wx.uploadFile', expression: /\bwx\s*\.\s*uploadFile\b/ },
  { label: 'wx.downloadFile', expression: /\bwx\s*\.\s*downloadFile\b/ },
  { label: 'wx.request', expression: /\bwx\s*\.\s*request\b/ },
  { label: 'wx.cloud', expression: /\bwx\s*\.\s*cloud\b/ },
  { label: 'http://', expression: /http:\/\// },
  { label: 'https://', expression: /https:\/\// },
]

function relativeFile(root, file) {
  return path.relative(root, file).split(path.sep).join('/')
}

function collectJavaScriptFiles(root, directory, files) {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
  entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        collectJavaScriptFiles(root, path.join(directory, entry.name), files)
      }
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.js') {
      const file = path.join(directory, entry.name)
      files.push({ absolute: file, relative: relativeFile(root, file) })
    }
  }
}

function scanFiles(root) {
  const resolvedRoot = path.resolve(root)
  const files = []
  const appFile = path.join(resolvedRoot, 'app.js')

  if (fs.existsSync(appFile) && fs.statSync(appFile).isFile()) {
    files.push({ absolute: appFile, relative: 'app.js' })
  }

  for (const directoryName of ['pages', 'utils', 'components', 'config']) {
    const directory = path.join(resolvedRoot, directoryName)
    if (fs.existsSync(directory) && fs.statSync(directory).isDirectory()) {
      collectJavaScriptFiles(resolvedRoot, directory, files)
    }
  }

  files.sort((left, right) => left.relative < right.relative ? -1 : left.relative > right.relative ? 1 : 0)

  const violations = []
  for (const file of files) {
    const lines = fs.readFileSync(file.absolute, 'utf8').split(/\r?\n/)
    lines.forEach((lineText, lineIndex) => {
      PATTERNS.forEach((pattern) => {
        if (pattern.expression.test(lineText)) {
          violations.push({ file: file.relative, line: lineIndex + 1, pattern: pattern.label })
        }
      })
    })
  }

  return violations
}

if (require.main === module) {
  const violations = scanFiles(process.cwd())
  if (violations.length === 0) {
    console.log('禁止运行时网络能力检查通过')
  } else {
    for (const violation of violations) {
      console.log(`${violation.file}:${violation.line}: 禁止使用 ${violation.pattern}`)
    }
    process.exitCode = 1
  }
}

module.exports = { scanFiles }
