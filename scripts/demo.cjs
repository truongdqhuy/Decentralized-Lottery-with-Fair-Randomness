// Automated smoke demonstration against the user's Ganache. Time travel affects this local chain.
const {ethers}=require('ethers');
const fs=require('node:fs');
async function main(){
  const provider=new ethers.JsonRpcProvider(process.env.GANACHE_URL||'http://127.0.0.1:7545');
  provider.pollingInterval=100;
  const accounts=await Promise.all([0,1,2].map(i=>provider.getSigner(i)));
  const artifact=require('../artifacts/contracts/FairLottery.sol/FairLottery.json');
  const c=await new ethers.ContractFactory(artifact.abi,artifact.bytecode,accounts[0]).deploy(ethers.parseEther('0.01'),ethers.parseEther('0.02'),200);
  await c.waitForDeployment();
  const output=[];
  async function tx(label,p){const r=await(await p).wait();const line=`${label}: tx ${r.hash}, gas ${r.gasUsed}`;console.log(line);output.push(line);}
  await tx('Open round',c.openRound(60,60));
  const secrets=[null,ethers.hexlify(ethers.randomBytes(32)),ethers.hexlify(ethers.randomBytes(32))];
  for(let i=1;i<=2;i++)await tx(`Buy ticket ${i}`,c.connect(accounts[i]).buyTicket(1,await c.commitmentFor(1,await accounts[i].getAddress(),secrets[i]),{value:ethers.parseEther('0.03')}));
  await provider.send('evm_increaseTime',[61]);await provider.send('evm_mine',[]);
  for(let i=1;i<=2;i++)await tx(`Reveal ${i}`,c.connect(accounts[i]).reveal(1,secrets[i]));
  await provider.send('evm_increaseTime',[61]);await provider.send('evm_mine',[]);
  await tx('Finalize',c.finalize(1));
  console.log(`Winner: ${(await c.getRound(1)).winner}`);
  for(const signer of accounts)await tx('Withdraw',c.connect(signer).withdraw(await signer.getAddress()));
  if(await provider.getBalance(await c.getAddress())!==0n)throw Error('Accounting failed: nonzero contract balance');
  fs.mkdirSync('docs',{recursive:true});fs.writeFileSync('docs/ganache-demo-results.txt',`Ganache RPC: ${process.env.GANACHE_URL||'http://127.0.0.1:7545'}\nContract: ${await c.getAddress()}\nWinner: ${(await c.getRound(1)).winner}\n${output.join('\n')}\nAll credits withdrawn; contract balance = 0 wei.\n`);
  console.log('Smoke demo passed. Separate deployment used; frontend configuration unchanged.');provider.destroy();
}
main().catch(e=>{console.error(e.shortMessage||e.message);process.exitCode=1;});
