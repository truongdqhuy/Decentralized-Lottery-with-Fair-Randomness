import { ethers } from 'ethers';
import { walletErrorMessage } from './wallet-errors.mjs';
const $ = id => document.getElementById(id);
let config, provider, signer, contract, account, roundId = 0n, busy = false, connecting = false;
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
  // Archived deployments use the original one-ticket ABI; keep old refunds accessible.
  const multiTicket=contract.interface.hasFunction('buyTickets');
  const totalTickets=r.totalTickets??r.playerCount;
  $('quantity').max=multiTicket?'100':'1';
  if(!multiTicket)$('quantity').value='1';
  const phase=!roundId?'No round':r.status===2n?'Settled':r.status===3n?'Cancelled':now<r.commitDeadline?'Commit':now<r.revealDeadline?'Reveal':'Ready to finalize';
  $('phase').textContent=phase; $('round').textContent=String(roundId); $('players').textContent=String(totalTickets); $('revealed').textContent=`${r.revealed} / ${r.playerCount}`;
  $('pot').textContent=fmt(totalTickets*price); $('credit').textContent=`${fmt(credit)} ETH`;
  $('commitTime').textContent=roundId?new Date(Number(r.commitDeadline)*1000).toLocaleTimeString():'—';
  $('revealTime').textContent=roundId?new Date(Number(r.revealDeadline)*1000).toLocaleTimeString():'—';
  $('winner').textContent=r.status===2n?`Winner: ${r.winner}`:'';
  $('winner').hidden=r.status!==2n;
  const stage=phase==='Commit'?'commit':phase==='Reveal'?'reveal':phase==='Ready to finalize'||phase==='Settled'?'draw':'';
  document.querySelectorAll('[data-stage]').forEach(el=>el.classList.toggle('active',el.dataset.stage===stage));
  const t=await contract.tickets(roundId,account);
  const first=t.commitment===ethers.ZeroHash;
  const owned=t.quantity??(first?0n:1n);
  const quantity=Number($('quantity').value);
  const valid=Number.isInteger(quantity)&&quantity>0&&quantity<=100&&BigInt(quantity)+owned<=100n&&BigInt(quantity)+totalTickets<=1000n;
  $('cost').textContent=valid?`${quantity} ticket(s) × ${fmt(price)} ETH + ${first?fmt(bond):'0'} ETH bond = ${fmt(price*BigInt(quantity)+(first?bond:0n))} ETH. One refundable bond per wallet per round.`:'Choose a valid quantity: at most 100 tickets per wallet and 1,000 per round.';
  $('ticketStatus').textContent=first?'NO TICKETS THIS ROUND':`${owned} TICKET(S) · ${t.revealed?'SECRET REVEALED':'KEEP YOUR SECRET'}`;
  $('buy').disabled=!(open&&now<r.commitDeadline&&valid&&(multiTicket||first)&&(!first||r.playerCount<100n));
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
  finally { busy=false; $('connect').disabled=false; $('reconnect').disabled=false; await refresh().catch(e=>notice(walletErrorMessage(e),true)); }
}
async function send(promise) { notice('Confirm the transaction in MetaMask…'); const tx=await promise; notice(`Transaction submitted: ${tx.hash}`); await tx.wait(); notice('Transaction confirmed. On-chain state updated.'); }
async function connectWallet(switchAccount = false) {
  connecting = true;
  try {
  if(!window.ethereum)throw Error('Install MetaMask, then open this page in that browser.');
  if(switchAccount) {
    notice('Choose the Ganache account to connect in MetaMask, then approve the connection.');
    await window.ethereum.request({method:'wallet_requestPermissions',params:[{eth_accounts:{}}]});
  }
  const response=await fetch('/frontend/deployment.json', {cache:'no-store'});
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
  $('connect').title=account;
  $('network').textContent=`Ganache · Chain ${config.chainId}`;
  $('history').textContent='Wallet changed. View a round to inspect its records for this connection.';
  notice(`Connected to ${account}. Buy during Commit, then return during Reveal. Back up your secret after buying.`);
  } finally { connecting = false; }
}
$('connect').onclick=()=>action(()=>connectWallet());
$('reconnect').onclick=()=>action(()=>connectWallet(true));
$('open').onclick=()=>action(()=>send(contract.openRound(Number($('commitSeconds').value),Number($('revealSeconds').value))));
$('buy').onclick=()=>action(async()=>{
  // Persist BEFORE submitting, so a page close after mining cannot lose the secret.
  const ticket=await contract.tickets(roundId,account);
  const saved=getSecret(roundId);
  if(ticket.commitment!==ethers.ZeroHash&&!saved)throw Error('Restore your existing secret backup before adding tickets. All tickets in this round use the same secret.');
  const quantity=Number($('quantity').value);
  if(!Number.isInteger(quantity)||quantity<1||quantity>100)throw Error('Choose between 1 and 100 tickets.');
  const secret=saved||ethers.hexlify(ethers.randomBytes(32)); saveSecret(roundId,secret);
  const commitment=await contract.commitmentFor(roundId,account,secret);
  const value=await contract.ticketPrice()*BigInt(quantity)+(ticket.commitment===ethers.ZeroHash?await contract.revealBond():0n);
  await send(contract.interface.hasFunction('buyTickets')?contract.buyTickets(roundId,commitment,quantity,{value}):contract.buyTicket(roundId,commitment,{value}));
  notice('Tickets confirmed. Download your secret backup. Reveal once for all your tickets before the deadline.');
});
$('quantity').addEventListener('input',()=>refresh().catch(e=>notice(walletErrorMessage(e),true)));
$('reveal').onclick=()=>action(async()=>{
  const secret=getSecret(roundId); if(!secret)throw Error('Secret missing. Restore your downloaded backup before revealing.');
  await send(contract.reveal(roundId,secret));
});
$('finalize').onclick=()=>action(()=>send(contract.finalize(roundId)));
$('withdraw').onclick=()=>action(()=>send(contract.withdraw(account)));
$('refund').onclick=()=>action(async()=>{
  const id=BigInt($('historyId').value);
  const r=await contract.getRound(id);
  if(r.status===0n)throw Error(`Round ${id} does not exist. Check the round number.`);
  if(r.status===1n)throw Error(`Round ${id} is still open. Wait until its reveal deadline, then finalize the round. Refunds are available only after cancellation.`);
  if(r.status===2n)throw Error(`Round ${id} settled successfully, so its tickets are not refundable. Use Collect to withdraw any prize or returned bond.`);
  const ticket=await contract.tickets(id,account);
  if(ticket.commitment===ethers.ZeroHash)throw Error(`This wallet has no ticket in round ${id}. Select the wallet that bought the ticket.`);
  if(ticket.refunded)throw Error(`Your round ${id} refund was already claimed. Use Collect to withdraw any remaining credit.`);
  await send(contract.claimRefund(id));
  notice('Ticket refund credited. Click Collect to transfer your available balance to your wallet.');
});
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
// Permission selection can emit accountsChanged before the request resolves.
// Let connectWallet finish binding that account instead of interrupting its prompt.
window.ethereum?.on('accountsChanged',()=>{ if(!connecting) location.reload(); });
window.ethereum?.on('chainChanged',()=>location.reload());
setInterval(()=>refresh().catch(e=>notice(walletErrorMessage(e),true)),4000);
