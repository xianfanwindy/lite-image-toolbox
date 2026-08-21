const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { scanFiles } = require('../scripts/check-no-network')

function withTempRoot(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lite-image-toolbox-network-'))
  try {
    return run(root)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

function writeFile(root, relativePath, content) {
  const file = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content, 'utf8')
}

test('scans app.js and JavaScript files recursively in the runtime directories', () => {
  withTempRoot((root) => {
    writeFile(root, 'app.js', 'wx.uploadFile({})\n')
    writeFile(root, 'pages/nested/page.js', 'wx.downloadFile({})\n')
    writeFile(root, 'utils/helper.js', 'wx.request ({})\n')
    writeFile(root, 'components/card/view.js', 'wx.cloud.callFunction({})\n')
    writeFile(root, 'config/runtime.js', 'const image = "https://example.test/image"\n')

    assert.deepEqual(scanFiles(root), [
      { file: 'app.js', line: 1, pattern: 'wx.uploadFile' },
      { file: 'components/card/view.js', line: 1, pattern: 'wx.cloud' },
      { file: 'config/runtime.js', line: 1, pattern: 'https://' },
      { file: 'pages/nested/page.js', line: 1, pattern: 'wx.downloadFile' },
      { file: 'utils/helper.js', line: 1, pattern: 'wx.request' },
    ])
  })
})

test('reports a wx.uploadFile violation with a relative file, line, and matched pattern', () => {
  withTempRoot((root) => {
    writeFile(root, 'pages/upload.js', '\n  wx . uploadFile ({})\n')

    assert.deepEqual(scanFiles(root), [
      { file: 'pages/upload.js', line: 2, pattern: 'wx.uploadFile' },
    ])
  })
})

test('detects split, computed, optional-chain, and comment-separated API members', () => {
  withTempRoot((root) => {
    writeFile(root, 'pages/variants.js', [
      'wx',
      ' .request({})',
      "wx['request']({})",
      'wx["request"]({})',
      'wx?.request({})',
      'wx /* comment */ . request({})',
      'wx /* comment */ . uploadFile({})',
      'wx [ "downloadFile" ]({})',
      'wx ? . cloud . callFunction({})',
      "wx?.['request']({})",
      'wx?.["request"]({})',
    ].join('\n'))

    assert.deepEqual(scanFiles(root), [
      { file: 'pages/variants.js', line: 1, pattern: 'wx.request' },
      { file: 'pages/variants.js', line: 3, pattern: 'wx.request' },
      { file: 'pages/variants.js', line: 4, pattern: 'wx.request' },
      { file: 'pages/variants.js', line: 5, pattern: 'wx.request' },
      { file: 'pages/variants.js', line: 6, pattern: 'wx.request' },
      { file: 'pages/variants.js', line: 7, pattern: 'wx.uploadFile' },
      { file: 'pages/variants.js', line: 8, pattern: 'wx.downloadFile' },
      { file: 'pages/variants.js', line: 9, pattern: 'wx.cloud' },
      { file: 'pages/variants.js', line: 10, pattern: 'wx.request' },
      { file: 'pages/variants.js', line: 11, pattern: 'wx.request' },
    ])
  })
})

test('strips regex literals without hiding real runtime API calls or flagging regex text', () => {
  withTempRoot((root) => {
    writeFile(root, 'utils/regex.js', [
      'const re = /https?:\\/\\//; wx.request({})',
      'const slash = /[/]/; wx.cloud.callFunction({})',
      'const name = /wx\\.request/',
      '// wx.uploadFile is still a comment',
      'wx.downloadFile({})',
    ].join('\n'))

    assert.deepEqual(scanFiles(root), [
      { file: 'utils/regex.js', line: 1, pattern: 'wx.request' },
      { file: 'utils/regex.js', line: 2, pattern: 'wx.cloud' },
      { file: 'utils/regex.js', line: 5, pattern: 'wx.downloadFile' },
    ])
  })
})

test('does not report prohibited text that occurs only in comments', () => {
  withTempRoot((root) => {
    writeFile(root, 'utils/comments.js', [
      '/* wx.uploadFile wx.downloadFile wx.request wx.cloud http:// https://',
      '   wx?.request wx["request"] */',
      '// wx.uploadFile wx.downloadFile wx.request wx.cloud http:// https://',
    ].join('\n'))

    assert.deepEqual(scanFiles(root), [])
  })
})

test('preserves strings and templates while stripping comments around runtime code', () => {
  withTempRoot((root) => {
    writeFile(root, 'config/strings.js', [
      "const single = 'http://inside-string'",
      'const escaped = \'escaped \\\' quote\'; // wx.request({})',
      'const template = `template marker // https://inside-template`; wx.cloud.callFunction({})',
    ].join('\n'))

    assert.deepEqual(scanFiles(root), [
      { file: 'config/strings.js', line: 1, pattern: 'http://' },
      { file: 'config/strings.js', line: 3, pattern: 'wx.cloud' },
      { file: 'config/strings.js', line: 3, pattern: 'https://' },
    ])
  })
})

test('allows wx.chooseMedia while covering all prohibited runtime capabilities', () => {
  withTempRoot((root) => {
    writeFile(root, 'pages/safe.js', 'wx.chooseMedia({})\n')
    writeFile(root, 'pages/prohibited.js', [
      'wx.downloadFile ({})',
      'wx . request ({})',
      'wx.cloud . callFunction({})',
      'const first = "http://example.test"',
      'const second = "https://example.test"',
    ].join('\n'))

    assert.deepEqual(scanFiles(root), [
      { file: 'pages/prohibited.js', line: 1, pattern: 'wx.downloadFile' },
      { file: 'pages/prohibited.js', line: 2, pattern: 'wx.request' },
      { file: 'pages/prohibited.js', line: 3, pattern: 'wx.cloud' },
      { file: 'pages/prohibited.js', line: 4, pattern: 'http://' },
      { file: 'pages/prohibited.js', line: 5, pattern: 'https://' },
    ])
  })
})

test('ignores documentation, checker scripts, and excluded dependency or metadata directories', () => {
  withTempRoot((root) => {
    writeFile(root, 'NOTICE', 'See https://example.test/license\n')
    writeFile(root, 'docs/usage.js', 'wx.request({})\n')
    writeFile(root, 'scripts/example.js', 'wx.uploadFile({})\n')
    writeFile(root, 'pages/node_modules/ignored.js', 'wx.request({})\n')
    writeFile(root, 'pages/NODE_MODULES/ignored-uppercase.js', 'wx.request({})\n')
    writeFile(root, 'pages/miniprogram_npm/ignored.js', 'wx.request({})\n')
    writeFile(root, 'pages/MINIPROGRAM_NPM/ignored-uppercase.js', 'wx.request({})\n')
    writeFile(root, 'pages/.git/ignored.js', 'wx.request({})\n')
    writeFile(root, 'pages/.GIT/ignored-uppercase.js', 'wx.request({})\n')
    writeFile(root, 'pages/.upstream-tools-applet/ignored.js', 'wx.request({})\n')
    writeFile(root, 'pages/.UPSTREAM-TOOLS-APPLET/ignored-uppercase.js', 'wx.request({})\n')

    assert.deepEqual(scanFiles(root), [])
  })
})

test('returns multiple violations in deterministic file, line, and pattern order', () => {
  withTempRoot((root) => {
    writeFile(root, 'utils/z.js', 'https://z.test\nwx.uploadFile({})\n')
    writeFile(root, 'pages/a.js', 'wx.cloud.callFunction({}); wx.request({})\n')
    const expected = [
      { file: 'pages/a.js', line: 1, pattern: 'wx.request' },
      { file: 'pages/a.js', line: 1, pattern: 'wx.cloud' },
      { file: 'utils/z.js', line: 1, pattern: 'https://' },
      { file: 'utils/z.js', line: 2, pattern: 'wx.uploadFile' },
    ]

    assert.deepEqual(scanFiles(root), expected)
    assert.deepEqual(scanFiles(root), expected)
  })
})

test('direct execution exits one and prints each violation', () => {
  withTempRoot((root) => {
    writeFile(root, 'pages/bad.js', 'wx.request({})\n')
    const checker = path.resolve(__dirname, '..', 'scripts', 'check-no-network.js')
    const result = spawnSync(process.execPath, [checker], {
      cwd: root,
      encoding: 'utf8',
    })

    assert.equal(result.status, 1)
    assert.match(result.stdout, /pages\/bad\.js:1: 禁止使用 wx\.request/)
  })
})

test('fails closed for missing, non-directory, and runtime-less roots', () => {
  withTempRoot((root) => {
    assert.throws(() => scanFiles(path.join(root, 'missing')), /runtime root/i)

    writeFile(root, 'not-a-directory', 'plain file')
    assert.throws(() => scanFiles(path.join(root, 'not-a-directory')), /runtime root/i)

    writeFile(root, 'docs/readme.js', 'wx.request({})')
    assert.throws(() => scanFiles(root), /runtime entry/i)
  })
})

test('direct execution rejects an empty directory without printing the pass message', () => {
  withTempRoot((root) => {
    const checker = path.resolve(__dirname, '..', 'scripts', 'check-no-network.js')
    const result = spawnSync(process.execPath, [checker], {
      cwd: root,
      encoding: 'utf8',
    })

    assert.notEqual(result.status, 0)
    assert.doesNotMatch(result.stdout, /禁止运行时网络能力检查通过/)
  })
})

test('rejects runtime roots and nested entries that are symbolic links', (t) => {
  withTempRoot((root) => {
    writeFile(root, 'pages/real.js', 'wx.chooseMedia({})')
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'lite-image-toolbox-network-outside-'))
    const nestedLink = path.join(root, 'pages', 'linked')
    const rootLink = path.join(path.dirname(root), `${path.basename(root)}-link`)
    const linkType = process.platform === 'win32' ? 'junction' : 'dir'

    try {
      try {
        fs.symlinkSync(outside, nestedLink, linkType)
        fs.symlinkSync(root, rootLink, linkType)
      } catch (error) {
        if (error.code === 'EPERM' || error.code === 'EACCES') {
          t.skip(`symbolic links unavailable: ${error.code}`)
          return
        }
        throw error
      }

      assert.throws(() => scanFiles(root), /symbolic|symlink|boundary/i)
      assert.throws(() => scanFiles(rootLink), /symbolic|symlink|boundary/i)
    } finally {
      fs.rmSync(rootLink, { recursive: true, force: true })
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })
})

test('the current repository has no prohibited runtime network capabilities', () => {
  assert.deepEqual(scanFiles(path.resolve(__dirname, '..')), [])
})
