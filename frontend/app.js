import { ethers } from 'ethers';
import { walletErrorMessage } from './wallet-errors.mjs';
const $ = id => document.getElementById(id);
let config, provider, signer, contract, account, roundId = 0n, busy = false;
const fmt = n => ethers.formatEther(n);
const notice = (text, error=false) => { $('notice').textContent=text; $('notice').className=error?'error':''; };
const key = id => `fairdraw:${config.chainId}:${config.address.toLowerCase()}:${id}:${account.toLowerCase()}`;
const getSecret = id => { const raw=localStorage.getItem(key(id)); return raw ? JSON.parse(raw).secret : null; };
function saveSecret(id, secret) {
  const backup={chainId:config.chainId,contract:config.address,round:String(id),account,secret};
  localStorage.setItem(key(id),JSON.stringify(backup)); return backup;
}
async function refresh() {
  if(!contract || busy) return;
  roundId=await contract.currentRound();
  const [r, price, bond, credit, owner, block] = await Promise.all([contract.getRound(roundId),contract.ticketPrice(),contract.revealBond(),contract.credits(account),contract.owner(),provider.getBlock('latest')]);
  const now=BigInt(block.timestamp), open=r.status===1n;
  const phase=!roundId?'No round':r.status===2n?'Settled':r.status===3n?'Cancelled':now<r.commitDeadline?'Commit':now<r.revealDeadline?'Reveal':'Ready to finalize';
  $('phase').textContent=phase; $('round').textContent=String(roundId); $('players').textContent=String(r.playerCount); $('revealed').textContent=String(r.revealed);
  $('pot').textContent=fmt(r.playerCount*price); $('credit').textContent=`${fmt(credit)} ETH`;
  $('cost').textContent=`Ticket ${fmt(price)} ETH + refundable reveal bond ${fmt(bond)} ETH.`;
  $('commitTime').textContent=roundId?new Date(Number(r.commitDeadline)*1000).toLocaleTimeString():'—';
  $('revealTime').textContent=roundId?new Date(Number(r.revealDeadline)*1000).toLocaleTimeString():'—';
  $('winner').textContent=r.status===2n?`Winner: ${r.winner}`:'';
  const t=await contract.tickets(roundId,account);
  $('buy').disabled=!(open&&now<r.commitDeadline&&t.commitment===ethers.ZeroHash&&r.playerCount<100n);
  $('reveal').disabled=!(open&&now>=r.commitDeadline&&now<r.revealDeadline&&t.commitment!==ethers.ZeroHash&&!t.revealed);
  $('finalize').disabled=!(open&&now>=r.revealDeadline);
  $('withdraw').disabled=credit===0n;
  $('open').disabled=owner.toLowerCase()!==account.toLowerCase()||open;
  $('backup').disabled=!getSecret(roundId);
  $('inspect').disabled=false; $('refund').disabled=false;
}
async function action(work) {
  if(busy)return; busy=true;
  const buttons=[...document.querySelectorAll('button')]; buttons.forEach(b=>b.disabled=true);
  try { await work(); } catch(e) { notice(walletErrorMessage(e),true); }
  finally { busy=false; $('connect').disabled=false; await refresh().catch(e=>notice(walletErrorMessage(e),true)); }
}
async function send(promise) { notice('Confirm the transaction in MetaMask…'); const tx=await promise; notice(`Transaction submitted: ${tx.hash}`); await tx.wait(); notice('Transaction confirmed. On-chain state updated.'); }
$('connect').onclick=()=>action(async()=>{
  if(!window.ethereum)throw Error('Install MetaMask, then open this page in that browser.');
  const response=await fetch('/frontend/deployment.json');
  if(!response.ok)throw Error('Run npm run deploy first to create the contract configuration.');
  config=await response.json();
  contract=undefined; // Do not poll a stale connection while reconnecting.
  provider?.destroy();
  provider=new ethers.BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts',[]);
  const chain=await provider.getNetwork();
  if(chain.chainId!==BigInt(config.chainId))throw Error(`Choose your Ganache network in MetaMask: chain ID ${config.chainId}, RPC ${config.rpcUrl}.`);
  signer=await provider.getSigner(); account=await signer.getAddress();
  if(await provider.getCode(config.address)==='0x')throw Error('No contract at this address. Ganache may have restarted; redeploy.');
  contract=new ethers.Contract(config.address,config.abi,signer);
  $('connect').textContent=`${account.slice(0,6)}…${account.slice(-4)}`;
  $('network').textContent=`Ganache · Chain ${config.chainId}`;
  notice('Connected. Buy during Commit, then return during Reveal. Back up your secret after buying.');
});
$('open').onclick=()=>action(()=>send(contract.openRound(Number($('commitSeconds').value),Number($('revealSeconds').value))));
$('buy').onclick=()=>action(async()=>{
  // Persist BEFORE submitting, so a page close after mining cannot lose the secret.
  const secret=getSecret(roundId)||ethers.hexlify(ethers.randomBytes(32)); saveSecret(roundId,secret);
  const commitment=await contract.commitmentFor(roundId,account,secret);
  await send(contract.buyTicket(roundId,commitment,{value:await contract.ticketPrice()+await contract.revealBond()}));
  notice('Ticket confirmed. Download your secret backup, and reveal before the deadline.');
});
$('reveal').onclick=()=>action(async()=>{
  const secret=getSecret(roundId); if(!secret)throw Error('Secret missing. Restore your downloaded backup before revealing.');
  await send(contract.reveal(roundId,secret));
});
$('finalize').onclick=()=>action(()=>send(contract.finalize(roundId)));
$('withdraw').onclick=()=>action(()=>send(contract.withdraw(account)));
$('refund').onclick=()=>action(()=>send(contract.claimRefund(BigInt($('historyId').value))));
$('inspect').onclick=()=>action(async()=>{
  const id=BigInt($('historyId').value); const r=await contract.getRound(id); const players=await contract.getPlayers(id);
  $('history').textContent=`Round ${id}: ${['Missing','Open','Settled','Cancelled'][Number(r.status)]}. Players: ${players.join(', ')||'none'}. Winner: ${r.winner===ethers.ZeroAddress?'none':r.winner}.`;
});
$('backup').onclick=()=>{
  const raw=localStorage.getItem(key(roundId)); if(!raw)return;
  const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`fairdraw-round-${roundId}-${account.slice(0,8)}.json`;a.click();URL.revokeObjectURL(url);
};
$('restore').onchange=()=>action(async()=>{
  if(!contract)throw Error('Connect your wallet before restoring.');
  const data=JSON.parse(await $('restore').files[0].text());
  if(data.chainId!==config.chainId||data.contract.toLowerCase()!==config.address.toLowerCase()||data.account.toLowerCase()!==account.toLowerCase()||!ethers.isHexString(data.secret,32))throw Error('Backup does not match this network, contract, or wallet.');
  const ticket=await contract.tickets(BigInt(data.round),account);
  if(await contract.commitmentFor(BigInt(data.round),account,data.secret)!==ticket.commitment)throw Error('Secret does not match the on-chain ticket.');
  saveSecret(BigInt(data.round),data.secret);notice(`Secret restored for round ${data.round}.`);
});
window.ethereum?.on('accountsChanged',()=>location.reload());
window.ethereum?.on('chainChanged',()=>location.reload());
setInterval(()=>refresh().catch(e=>notice(walletErrorMessage(e),true)),4000);
