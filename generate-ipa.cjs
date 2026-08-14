#!/usr/bin/env node
/**
 * 德语 IPA 音标生成器（基于规则的字位-音位转换）
 *
 * 德语拼写-发音规律性较强，本脚本实现常见规则：
 * - 元音字母组合 (ei/ie/eu/äu/au 等双元音)
 * - 元音长短音判断（开音节/闭音节、双写字母、字母h）
 * - 辅音组合 (sch/ch/sp/st/ng/pf/qu/ck/tz)
 * - 元音变音 (ä/ö/ü)
 * - 典型重音位置（复合词重音落在第一成分，前缀 be-/ge-/ver-/zer-/ent-/emp-/er-
 *   不重读，其余多为首音节重音）
 *
 * 注：这是基于规则的近似转写，不是完美的语音学转写，但比完全缺失要好得多。
 * 复合词的重音/边界判断依赖已有的 wordBuilding.parts 拆解结果（如果有）。
 */
const fs = require('fs')

const UNSTRESSED_PREFIXES = ['be', 'ge', 'ver', 'zer', 'ent', 'emp', 'er', 'miss', 'wider']

function isVowelLetter(ch) { return 'aeiouäöüAEIOUÄÖÜ'.includes(ch) }

// 把德语正字法字符串转换为音节+音位序列（简化版）
function transcribeWord(word) {
  let w = word
  // 处理常见字母组合，用占位符标记，避免和单字母规则冲突
  const tokens = []
  let i = 0
  const lower = w.toLowerCase()

  while (i < lower.length) {
    const rest = lower.slice(i)

    // 三字母组合优先
    if (rest.startsWith('sch')) { tokens.push('ʃ'); i += 3; continue }
    if (rest.startsWith('tsch')) { tokens.push('tʃ'); i += 4; continue }

    // 双字母元音组合
    if (rest.startsWith('ie')) { tokens.push('iː'); i += 2; continue }
    if (rest.startsWith('ei') || rest.startsWith('ai')) { tokens.push('aɪ'); i += 2; continue }
    if (rest.startsWith('eu') || rest.startsWith('äu')) { tokens.push('ɔʏ'); i += 2; continue }
    if (rest.startsWith('au')) { tokens.push('aʊ'); i += 2; continue }
    if (rest.startsWith('aa')) { tokens.push('aː'); i += 2; continue }
    if (rest.startsWith('ee')) { tokens.push('eː'); i += 2; continue }
    if (rest.startsWith('oo')) { tokens.push('oː'); i += 2; continue }

    // 元音+h（长音标志）
    if (isVowelLetter(rest[0]) && rest[1] === 'h') {
      const v = rest[0]
      const map = { a: 'aː', e: 'eː', i: 'iː', o: 'oː', u: 'uː', ä: 'ɛː', ö: 'øː', ü: 'yː' }
      tokens.push(map[v] || v)
      i += 2
      continue
    }

    // 双写辅音（如 ss/ll/mm/nn/pp/tt/ff/rr/bb/dd/gg）只发一个辅音音，
    // 作用是标记前面元音为短音，不应该按两个字母分别转写
    if (rest[0] === rest[1] && !isVowelLetter(rest[0]) && rest[0] !== 'h') {
      if (rest.startsWith('ck')) { tokens.push('k'); i += 2; continue }
      if (rest.startsWith('tz')) { tokens.push('ts'); i += 2; continue }
      const doubleMap = { s: 's', f: 'f', l: 'l', m: 'm', n: 'n', p: 'p', t: 't', r: 'ʁ', b: 'b', d: 'd', g: 'g' }
      if (doubleMap[rest[0]]) { tokens.push(doubleMap[rest[0]]); i += 2; continue }
    }

    // 辅音组合
    if (rest.startsWith('pf')) { tokens.push('pf'); i += 2; continue }
    if (rest.startsWith('qu')) { tokens.push('kv'); i += 2; continue }
    if (rest.startsWith('ng')) { tokens.push('ŋ'); i += 2; continue }
    if (rest.startsWith('nk')) { tokens.push('ŋk'); i += 2; continue }
    if (rest.startsWith('ch')) {
      // 前元音/辅音后 ç，前面是 a/o/u（且确实有前一个字符）时用 x；词首默认 ç
      const prev = i > 0 ? lower[i - 1] : null
      tokens.push(prev !== null && 'aou'.includes(prev) ? 'x' : 'ç')
      i += 2
      continue
    }
    if (rest.startsWith('sp') && (i === 0 || !isVowelLetter(lower[i - 1]))) { tokens.push('ʃp'); i += 2; continue }
    if (rest.startsWith('st') && (i === 0 || !isVowelLetter(lower[i - 1]))) { tokens.push('ʃt'); i += 2; continue }
    if (rest.startsWith('ph')) { tokens.push('f'); i += 2; continue }
    if (rest.startsWith('th')) { tokens.push('t'); i += 2; continue }

    // 单字母
    const ch = rest[0]
    const singleMap = {
      a: 'a', e: 'ə', i: 'ɪ', o: 'ɔ', u: 'ʊ',
      ä: 'ɛ', ö: 'œ', ü: 'ʏ', y: 'ʏ',
      b: 'b', c: 'k', d: 'd', f: 'f', g: 'g', h: 'h', j: 'j', k: 'k',
      l: 'l', m: 'm', n: 'n', p: 'p', q: 'k', r: 'ʁ', t: 't',
      v: 'f', w: 'v', x: 'ks', z: 'ts', 'ß': 's',
    }
    // 词末 -er 常弱化为 ɐ
    if (ch === 'r' && i === lower.length - 1) { tokens.push('ɐ'); i += 1; continue }
    // s 在元音前（且不是词尾/音节尾）浊化为 z，其余（词尾、辅音前）为清音 s
    if (ch === 's') {
      const nextIsVowel = rest.length > 1 && isVowelLetter(rest[1])
      tokens.push(nextIsVowel ? 'z' : 's')
      i += 1
      continue
    }
    if (singleMap[ch]) { tokens.push(singleMap[ch]); i += 1; continue }
    // 未知字符，跳过
    i += 1
  }

  return tokens.join('')
}

// 生成音节（复用已有的 pronunciation.syllables，如果没有则简单按元音分割）
// 注意：部分词条的 syllables 里第一个音节混入了冠词（如 "das Aus"），
// 这里统一清理掉，只保留词干本身的音节。
function getSyllables(word, existingSyllables) {
  if (existingSyllables && existingSyllables.length > 0) {
    const cleaned = existingSyllables
      .map(s => s.replace(/^(der|die|das)\s+/i, ''))
      .filter(s => s.length > 0 && !/^(der|die|das)$/i.test(s.trim()))
    if (cleaned.length > 0) return cleaned
  }
  // 简易分割：每个元音字母（组合）后断一次
  const syl = word.match(/[^aeiouäöüAEIOUÄÖÜ]*[aeiouäöüAEIOUÄÖÜ]+[^aeiouäöüAEIOUÄÖÜ]*/g)
  return syl && syl.length > 0 ? syl : [word]
}

function stripArticle(lemma) {
  const m = lemma.match(/^(der|die|das)\s+(.+)$/i)
  return m ? m[2] : lemma
}

function generateIPA(word) {
  const core = stripArticle(word.lemma)
  const syllables = getSyllables(core, word.pronunciation?.syllables)

  // 逐音节转写，音节间不加分隔符（连续转写更符合IPA习惯，仅在需要处标重音）
  let ipa = ''
  let stressPlaced = false

  // 判断重音音节索引：跳过非重读前缀
  let stressIdx = 0
  const firstSylLower = (syllables[0] || '').toLowerCase()
  if (UNSTRESSED_PREFIXES.some(p => firstSylLower === p) && syllables.length > 1) {
    stressIdx = 1
  }

  // 德语音节切分习惯把双写辅音拆到相邻两个音节两边（如 "Mes-se"、"Was-ser"），
  // 逐音节转写会漏掉"双写只发一个音"的规则，这里跨音节检测并去重一次
  const normalizedSyllables = syllables.map((syl, idx) => {
    if (idx === 0) return syl
    const prevSyl = syllables[idx - 1]
    const prevLast = prevSyl[prevSyl.length - 1]
    const curFirst = syl[0]
    if (
      prevLast && curFirst &&
      prevLast.toLowerCase() === curFirst.toLowerCase() &&
      !isVowelLetter(prevLast)
    ) {
      return syl.slice(1) // 去掉与上一音节重复的辅音字母
    }
    return syl
  })

  normalizedSyllables.forEach((syl, idx) => {
    if (idx === stressIdx && normalizedSyllables.length > 1) ipa += 'ˈ'
    ipa += transcribeWord(syl)
  })

  return ipa
}

function fix(inputPath, outputPath) {
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  const words = data.entries
  let fixedCount = 0

  let skippedPhrases = 0
  words.forEach(word => {
    if (word.pronunciation?.ipa) return // 已有，跳过
    const core = stripArticle(word.lemma)
    if (/\s/.test(core)) { skippedPhrases++; return } // 多词短语暂不处理，避免拼接出错误结果
    const ipa = generateIPA(word)
    if (!ipa || ipa.length < 2) return

    if (!word.pronunciation) word.pronunciation = {}
    word.pronunciation.ipa = ipa
    fixedCount++
  })

  console.log(`✅ 生成 IPA 音标: ${fixedCount} 个词条`)
  console.log(`⏭️  跳过多词短语(暂不处理): ${skippedPhrases} 个词条`)
  fs.writeFileSync(outputPath, JSON.stringify({ ...data, entries: words }, null, 2), 'utf8')
  console.log(`已保存到: ${outputPath}`)
}

fix(process.argv[2], process.argv[3] || process.argv[2])
