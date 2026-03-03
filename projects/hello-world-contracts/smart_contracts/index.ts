import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { consoleLogger } from '@algorandfoundation/algokit-utils/types/logging'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

// ESM compatibility: __dirname equivalent
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Uncomment the traceAll option to enable auto generation of AVM Debugger compliant sourceMap and simulation trace file for all AVM calls.
// Learn more about using AlgoKit AVM Debugger to debug your TEAL source codes and inspect various kinds of Algorand transactions in atomic groups -> https://github.com/algorandfoundation/algokit-avm-vscode-Debugger

Config.configure({
  logger: consoleLogger,
  debug: true,
  //  traceAll: true,
})
registerDebugEventHandlers()

// base directory
const baseDir = path.resolve(__dirname)

// function to validate and dynamically import a module
async function importDeployerIfExists(dir: string) {
  const deployerPath = path.resolve(dir, 'deploy-config')
  const tsExists = fs.existsSync(deployerPath + '.ts')
  const jsExists = fs.existsSync(deployerPath + '.js')
  
  if (tsExists || jsExists) {
    // Determine the full path with extension
    const fullPath = tsExists ? deployerPath + '.ts' : deployerPath + '.js'
    // Convert Windows paths to file:// URLs for ESM imports
    const deployerURL = `file:///${fullPath.replace(/\\/g, '/')}`
    const deployer = await import(deployerURL)
    return { ...deployer, name: path.basename(dir) }
  }
  return null
}

// get a list of all deployers from the subdirectories
async function getDeployers(filterName?: string) {
  let directories = fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)

  // Filter directories before importing if a contract name is specified
  if (filterName) {
    directories = directories.filter(name => name === filterName)
  }

  const resolvedPaths = directories.map(name => path.resolve(baseDir, name))
  const deployers = await Promise.all(resolvedPaths.map(importDeployerIfExists))
  return deployers.filter((deployer) => deployer !== null) // Filter out null values
}

// execute all the deployers
(async () => {
  const contractName = process.argv.length > 2 ? process.argv[2] : undefined
  const contractDeployers = await getDeployers(contractName)

  if (contractName && contractDeployers.length === 0) {
    console.warn(`No deployer found for contract name: ${contractName}`)
    return
  }

  for (const deployer of contractDeployers) {
    try {
      await deployer.deploy()
    } catch (e) {
      console.error(`Error deploying ${deployer.name}:`, e)
    }
  }
})()
