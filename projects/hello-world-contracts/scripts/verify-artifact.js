const fs = require('fs')
const path = require('path')

function readJson(filePath) {
  try {
    const abs = path.resolve(filePath)
    const raw = fs.readFileSync(abs, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    console.error(`Cannot read ${filePath}:`, err.message)
    return null
  }
}

function listArc56Methods(arc56) {
  if (!arc56) return
  console.log('ARC-56 methods:')
  if (Array.isArray(arc56.methods)) {
    console.log(arc56.methods.map(m => m.name).join(', '))
  } else {
    console.log('  (no methods array)')
  }
  const boxMaps = arc56.state && arc56.state.maps && arc56.state.maps.box
  if (boxMaps) {
    console.log('ARC-56 box maps:', Object.keys(boxMaps).join(', '))
  }
}

function listArc32Methods(arc32) {
  if (!arc32) return
  console.log('ARC-32 contract methods:')
  if (arc32.contract && Array.isArray(arc32.contract.methods)) {
    console.log(arc32.contract.methods.map(m => m.name).join(', '))
  } else {
    console.log('  (no contract.methods)')
  }
  if (arc32.schema && arc32.schema.global && arc32.schema.global.declared) {
    console.log('ARC-32 global keys:', Object.keys(arc32.schema.global.declared).join(', '))
  }
}

const arc56Path = './smart_contracts/artifacts/augurion_v2/AugurionMarketV2.arc56.json'
const arc32Path = './smart_contracts/artifacts/augurion_v2/AugurionMarketV2.arc32.json'

const arc56 = readJson(arc56Path)
const arc32 = readJson(arc32Path)

console.log('\n--- Verification of local artifacts ---')
listArc56Methods(arc56)
console.log('')
listArc32Methods(arc32)
console.log('\nIf `claim` is present in these outputs but LORA does not show it, make sure you imported the correct file into LORA (prefer ARC-56).')

process.exit(0)
