const assert = require('node:assert/strict');
const fs = require('node:fs');
const ganache = require('ganache');
const { ethers } = require('ethers');
const artifact = require('../artifacts/contracts/FairLottery.sol/FairLottery.json');
const price = ethers.parseEther('0.01'), bond = ethers.parseEther('0.02');
const secret = n => ethers.zeroPadValue(ethers.toBeHex(n), 32);
const gas = {};
describe('FairLottery on Ganache', function () {
  let rpc, provider, accounts, c;
  const tx = async (p, label) => { const r = await (await p).wait(); if (label) gas[label] = Number(r.gasUsed); return r; };
  const revert = async p => { await assert.rejects(async () => { const t = await p; if(t.wait) await t.wait(); }); };
  const advance = async seconds => { await rpc.request({method:'evm_increaseTime', params:[seconds]}); await rpc.request({method:'evm_mine', params:[]}); };
  async function enter(i, s = secret(i)) {
    const hash = await c.commitmentFor(1, await accounts[i].getAddress(), s);
    return tx(c.connect(accounts[i]).buyTicket(1, hash, {value:price+bond}), 'buyTicket');
  }
  beforeEach(async () => {
    rpc = ganache.provider({logging:{quiet:true}, chain:{chainId:1337, hardfork:'shanghai'}, wallet:{totalAccounts:6}, miner:{timestampIncrement:0}});
    // Time travel changes state without waiting for ethers' default 250 ms RPC cache.
    provider = new ethers.BrowserProvider(rpc, undefined, { cacheTimeout: -1 }); provider.pollingInterval = 10;
    accounts = await Promise.all(Array.from({length:6}, (_,i)=>provider.getSigner(i)));
    c = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, accounts[0]).deploy(price,bond,200);
    gas.deployment = Number((await c.deploymentTransaction().wait()).gasUsed);
    await tx(c.openRound(60,60), 'openRound');
  });
  afterEach(async () => { provider.destroy(); await rpc.disconnect(); });
  after(() => { fs.mkdirSync('docs',{recursive:true}); fs.writeFileSync('docs/gas-results.json', JSON.stringify({environment:'Ganache 7.9.2, chain 1337, Shanghai; solc 0.8.24, Paris target, optimizer 200 runs',scenario:'Two entrants; 0.01 ETH ticket + 0.02 ETH bond; 2% fee. Values are receipt gasUsed; storage state affects gas.',gas},null,2)); });
  it('settles deterministically, returns bonds, charges exactly 2%, emits events, and withdraws', async () => {
    await enter(1); await enter(2); await advance(60);
    await tx(c.connect(accounts[1]).reveal(1,secret(1)), 'revealFirst');
    await tx(c.connect(accounts[2]).reveal(1,secret(2)), 'revealNext');
    await advance(60);
    const receipt = await tx(c.connect(accounts[3]).finalize(1), 'finalizeSuccess');
    const r = await c.getRound(1), players = await c.getPlayers(1);
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const rand = BigInt(ethers.keccak256(coder.encode(['address','uint256','uint256','uint256'],[await c.getAddress(),1337,1,r.entropy])));
    assert.equal(r.winner, players[Number(rand%2n)]); assert.equal(r.status,2n);
    assert.equal(await c.credits(r.winner), bond+price*2n*98n/100n);
    assert.equal(await c.credits(await accounts[0].getAddress()),price*2n*2n/100n);
    assert(receipt.logs.some(l=>{try{return c.interface.parseLog(l).name==='WinnerSelected';}catch{return false;}}));
    for(const signer of accounts.slice(0,3)) await tx(c.connect(signer).withdraw(await signer.getAddress()),'withdraw');
    assert.equal(await provider.getBalance(await c.getAddress()),0n);
  });
  it('cancels a withheld reveal; refunds tickets once; slashes only the missing bond', async () => {
    await enter(1); await enter(2); await advance(60);
    await tx(c.connect(accounts[1]).reveal(1,secret(1))); await advance(60);
    await tx(c.finalize(1),'finalizeCancelled');
    assert.equal((await c.getRound(1)).status,3n);
    await tx(c.connect(accounts[1]).claimRefund(1),'claimRefundRevealed');
    await tx(c.connect(accounts[2]).claimRefund(1),'claimRefundMissing');
    assert.equal(await c.credits(await accounts[1].getAddress()),price+bond);
    assert.equal(await c.credits(await accounts[2].getAddress()),price);
    assert.equal(await c.credits(await accounts[0].getAddress()),bond);
    await revert(c.connect(accounts[1]).claimRefund(1));
  });
  it('cancels empty and single-player rounds without locking funds', async () => {
    await advance(120); await tx(c.finalize(1));
    await tx(c.openRound(60,60));
    const hash = await c.commitmentFor(2,await accounts[1].getAddress(),secret(1));
    await tx(c.connect(accounts[1]).buyTicket(2,hash,{value:price+bond}));
    await advance(60); await tx(c.connect(accounts[1]).reveal(2,secret(1))); await advance(60);
    await tx(c.finalize(2)); await tx(c.connect(accounts[1]).claimRefund(2));
    assert.equal(await c.credits(await accounts[1].getAddress()),price+bond);
  });
  it('rejects unauthorized opening, overlapping rounds and short windows', async () => {
    await revert(c.connect(accounts[1]).openRound(60,60)); await revert(c.openRound(60,60));
    await advance(120); await tx(c.finalize(1)); await revert(c.openRound(1,60));
  });
  it('rejects incorrect payments, empty commitments, duplicate entry and late purchases', async () => {
    await revert(c.connect(accounts[1]).buyTicket(1,secret(1),{value:price}));
    await revert(c.connect(accounts[1]).buyTicket(1,ethers.ZeroHash,{value:price+bond}));
    await enter(1); await revert(enter(1, secret(9))); await advance(60); await revert(enter(2));
  });
  it('rejects early, wrong, missing, copied, repeated and late reveals', async () => {
    await enter(1); await revert(c.connect(accounts[1]).reveal(1,secret(1)));
    const copied = await c.commitmentFor(1,await accounts[1].getAddress(),secret(1));
    await tx(c.connect(accounts[2]).buyTicket(1,copied,{value:price+bond}));
    await advance(60); await revert(c.connect(accounts[1]).reveal(1,secret(9)));
    await revert(c.connect(accounts[3]).reveal(1,secret(1)));
    await revert(c.connect(accounts[2]).reveal(1,secret(1)));
    await tx(c.connect(accounts[1]).reveal(1,secret(1)));
    await revert(c.connect(accounts[1]).reveal(1,secret(1)));
    await advance(60); await revert(c.connect(accounts[2]).reveal(1,secret(2)));
  });
  it('rejects early/repeated finalization, invalid refunds and empty withdrawals', async () => {
    await revert(c.finalize(1)); await revert(c.claimRefund(1));
    await revert(c.withdraw(await accounts[0].getAddress()));
    await advance(120); await tx(c.finalize(1)); await revert(c.finalize(1)); await revert(c.claimRefund(1));
  });
  it('preserves credits if recipient rejects payment and blocks reentrant withdrawal', async () => {
    const a = require('../artifacts/contracts/WithdrawalProbe.sol/WithdrawalProbe.json');
    const probe = await new ethers.ContractFactory(a.abi,a.bytecode,accounts[0]).deploy(await c.getAddress());
    await probe.waitForDeployment();
    const hash = await c.commitmentFor(1,await probe.getAddress(),secret(8));
    await tx(probe.enter(1,hash,{value:price+bond})); await enter(1); await advance(60);
    await tx(probe.reveal(1,secret(8)));
    await revert(c.connect(accounts[1]).withdraw(ethers.ZeroAddress));
    // The lottery has no receive function, so sending the bond to it must revert.
    await tx(c.connect(accounts[1]).reveal(1,secret(1)));
    await revert(c.connect(accounts[1]).withdraw(await c.getAddress()));
    assert.equal(await c.credits(await accounts[1].getAddress()),bond);
    await tx(probe.withdraw()); assert.equal(await probe.attempted(),true); assert.equal(await probe.reentered(),false);
    assert.equal(await c.credits(await probe.getAddress()),0n);
  });
  it('keeps prior-round claims available after the next round opens and separates commitments', async () => {
    await enter(1); await advance(120); await tx(c.finalize(1)); await tx(c.openRound(60,60));
    assert.notEqual(await c.commitmentFor(1,await accounts[1].getAddress(),secret(1)),await c.commitmentFor(2,await accounts[1].getAddress(),secret(1)));
    await tx(c.connect(accounts[1]).claimRefund(1)); assert.equal(await c.credits(await accounts[1].getAddress()),price);
  });
  it('weights each paid ticket equally, charges one bond per wallet and reveals once', async () => {
    const a=await accounts[1].getAddress(), b=await accounts[2].getAddress();
    const commitment=await c.commitmentFor(1,a,secret(1));
    await tx(c.connect(accounts[1]).buyTickets(1,commitment,3,{value:price*3n+bond}),'buyThreeTickets');
    await tx(c.connect(accounts[1]).buyTickets(1,commitment,2,{value:price*2n}),'topUpTwoTickets');
    await enter(2);
    const owners=await c.getTicketOwners(1);
    assert.deepEqual([...owners],[a,a,a,a,a,b]);
    assert.equal((await c.getRound(1)).playerCount,2n);
    assert.equal((await c.getRound(1)).totalTickets,6n);
    assert.equal((await c.tickets(1,a)).quantity,5n);
    await advance(60);await tx(c.connect(accounts[1]).reveal(1,secret(1)));await tx(c.connect(accounts[2]).reveal(1,secret(2)));
    assert.equal(await c.credits(a),bond);await advance(60);await tx(c.finalize(1));
    const r=await c.getRound(1);
    const random=BigInt(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address','uint256','uint256','uint256'],[await c.getAddress(),1337,1,r.entropy])));
    assert.equal(r.winner,owners[Number(random%6n)]);
    assert.equal(await c.credits(r.winner),bond+price*6n*98n/100n);
    for(const signer of accounts.slice(0,3))await tx(c.connect(signer).withdraw(await signer.getAddress()));
    assert.equal(await provider.getBalance(await c.getAddress()),0n);
  });
  it('refunds all purchased tickets on cancellation but forfeits only one missing bond', async()=>{
    const a=await accounts[1].getAddress(), commitment=await c.commitmentFor(1,a,secret(1));
    await tx(c.connect(accounts[1]).buyTickets(1,commitment,4,{value:price*4n+bond}));
    await advance(120);await tx(c.finalize(1));await tx(c.connect(accounts[1]).claimRefund(1));
    assert.equal(await c.credits(a),price*4n);assert.equal(await c.credits(await accounts[0].getAddress()),bond);
    await revert(c.connect(accounts[1]).claimRefund(1));
  });
  it('rejects zero/excess quantities, changed commitments and a second bond on top-up', async()=>{
    const a=await accounts[1].getAddress(), commitment=await c.commitmentFor(1,a,secret(1));
    await revert(c.connect(accounts[1]).buyTickets(1,commitment,0,{value:bond}));
    await revert(c.connect(accounts[1]).buyTickets(1,commitment,101,{value:price*101n+bond}));
    await enter(1);
    await revert(c.connect(accounts[1]).buyTickets(1,secret(9),1,{value:price}));
    await revert(c.connect(accounts[1]).buyTickets(1,commitment,1,{value:price+bond}));
  });
});
