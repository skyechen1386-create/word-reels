#!/usr/bin/env node
/**
 * 应用手写内容批次到词库
 * 用法: node apply-hand-content.cjs <input.json> <output.json> <batch1.cjs> [batch2.cjs ...]
 */
const fs = require('fs')

const inputPath = process.argv[2]
const outputPath = process.argv[3]
const batchFiles = process.argv.slice(4)

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
const words = data.entries

let applied = 0
let notFound = []

batchFiles.forEach(bf => {
  const batch = require(require('path').resolve(bf))
  Object.entries(batch).forEach(([lemma, content]) => {
    const word = words.find(w => w.lemma === lemma)
    if (!word) { notFound.push(lemma); return }

    word.definition = { ...(word.definition || {}), de: content.de }
    word.coreAssociation = { zh: content.coreZh, de: content.coreDe }
    word.mnemonic = { zh: content.mnemonicZh, warningZh: '这是人为设计的记忆方法，不是真实词源。' }
    applied++
  })
})

console.log(`✅ 已应用 ${applied} 个词条的手写内容`)
if (notFound.length > 0) {
  console.log(`⚠️  未找到对应词条 (${notFound.length}):`, notFound.join(', '))
}

fs.writeFileSync(outputPath, JSON.stringify({ ...data, entries: words }, null, 2), 'utf8')
console.log(`已保存到: ${outputPath}`)
