# Team 7: 10-minute live demonstration

**Trương Đức Quốc Huy (29211154415)** and **Trần Bảo Duy (28211354517)**.

Before presenting: open Ganache; deploy; start the web UI; import three Ganache-only accounts into MetaMask; test switching between them. Keep the terminal ready with `npm test`. Do not show private keys or secret backup contents on the projector. Practice once because MetaMask signing takes time. Use two-minute commit and reveal windows for the main round.

| Time | Presenter | Demonstration |
| --- | --- | --- |
| 0:00-1:00 | Huy | Introduce goal, 0.01 ETH ticket, 2% fee, and why a block timestamp is predictable and influenced by block producers. |
| 1:00-2:00 | Huy | Show contract diagram, Ganache RPC and funded test accounts. Explain commitment domain and refundable 0.02 ETH bond. |
| 2:00-4:00 | Huy | Owner opens 120/120-second round. Switch to player 1, buy and back up. Switch to player 2, buy and back up. Show Ganache transaction and TicketBought event. |
| 4:00-6:00 | Duy | After commit deadline, reveal from each player. Explain on-chain hash check and credited bond. Show revealed count 2/2. Discuss last-revealer abort while waiting. |
| 6:00-7:00 | Duy | After reveal deadline, finalize from any account. Show winner, 0.0196 ETH prize and 0.0004 ETH owner fee for two tickets. Withdraw winner's credit (prize plus bond). |
| 7:00-8:00 | Duy | Show captured tests and measured gas table. Explain running accumulator, packed fields and loop-free settlement. |
| 8:00-9:00 | Huy | Open 30/30-second round; buy one ticket and intentionally do not reveal. Explain cancellation/refund while deadlines pass. |
| 9:00-10:00 | Both | Finalize cancellation, view that round and claim 0.01 ETH ticket refund. Explain 0.02 ETH forfeited bond. Conclude with limitations: withholding/DoS, multiple wallets, local secrets, and VRF extension. |

Fallback: if a signing dialog is slow, use the previously captured Ganache smoke-demo results as supporting evidence, clearly identifying them as a prior run. Do not claim the automated script proves MetaMask interaction. Keep the normal demo in real time; `npm run demo` time travel is only for practice and affects all contracts on the workspace.
