const { ethers } = require('ethers');
const fs = require('node:fs');
async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.GANACHE_URL || 'http://127.0.0.1:7545');
  const signer = await provider.getSigner(0);
  const artifact = require('../artifacts/contracts/FairLottery.sol/FairLottery.json');
  const c = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer)
    .deploy(ethers.parseEther('0.01'), ethers.parseEther('0.02'), 200);
  const receipt = await c.deploymentTransaction().wait();
  const network = await provider.getNetwork();
  const deployment = { address: await c.getAddress(), chainId: Number(network.chainId), rpcUrl: process.env.GANACHE_URL || 'http://127.0.0.1:7545', abi: artifact.abi, deployedBlock: receipt.blockNumber };
  fs.mkdirSync('frontend', { recursive: true });
  fs.writeFileSync('frontend/deployment.json', JSON.stringify(deployment, null, 2));
  console.log(`Deployed FairLottery: ${deployment.address}\nChain ID: ${network.chainId}\nDeployment gas: ${receipt.gasUsed}\nFrontend configuration written. Run npm run dev.`);
  provider.destroy();
}
main().catch(e => { console.error(e.shortMessage || e.message); process.exitCode = 1; });
