"""Generate the six-page coursework report from measured Ganache gas data.
Run with Python + reportlab + pypdfium2; outputs PDF and QA page PNGs.
"""
from pathlib import Path
import json
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/pdf'
OUT.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('Arial', 'C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('Arial-Bold', 'C:/Windows/Fonts/arialbd.ttf'))
pdfmetrics.registerFontFamily('Arial', normal='Arial', bold='Arial-Bold', italic='Arial', boldItalic='Arial-Bold')
W,H=595.28,841.89
INK=HexColor('#193b30'); MUTED=HexColor('#607565'); LINE=HexColor('#d6dfcf'); LIME=HexColor('#d4ee91')
style=ParagraphStyle('body',fontName='Arial',fontSize=10,leading=15,textColor=INK,spaceAfter=10)
c=canvas.Canvas(str(OUT/'team7-project-report.pdf'),pagesize=(W,H))
c.setTitle('Team 7 - Decentralized Lottery with Fair Randomness')
c.setAuthor('Trương Đức Quốc Huy; Trần Bảo Duy')
y=0
def page(n,title,subtitle):
    global y
    c.setFillColor(INK); c.rect(0,H-14,W,14,fill=1,stroke=0)
    c.setFont('Arial-Bold',9);c.drawString(46,H-47,'FAIRDRAW / TEAM 7 / PROJECT 10')
    c.setFont('Arial',8);c.setFillColor(MUTED);c.drawRightString(W-46,H-47,'16 NOVEMBER 2026')
    c.setFillColor(INK);c.setFont('Arial-Bold',25);c.drawString(46,H-96,title)
    c.setFont('Arial',10);c.setFillColor(MUTED);c.drawString(46,H-119,subtitle)
    c.setStrokeColor(LINE);c.line(46,48,W-46,48)
    c.setFont('Arial',8);c.drawString(46,32,'DECENTRALIZED LOTTERY WITH FAIR RANDOMNESS');c.drawRightString(W-46,32,f'{n} / 6')
    y=H-147
def p(text):
    global y
    para=Paragraph(text,style);_,h=para.wrap(W-92,700)
    assert y-h>62, f'Page overflow: {text[:50]} at {y}'
    para.drawOn(c,46,y-h);y-=h+10
def h(text):
    global y
    c.setFillColor(INK);c.setFont('Arial-Bold',12);c.drawString(46,y-13,text);y-=27
def table(rows,widths):
    global y
    cells=[[Paragraph(str(v),ParagraphStyle('cell',parent=style,fontSize=9,leading=12,spaceAfter=0)) for v in row] for row in rows]
    t=Table(cells,colWidths=widths)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),LIME),('VALIGN',(0,0),(-1,-1),'TOP'),('BOTTOMPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),9),('LINEBELOW',(0,0),(-1,-1),0.5,LINE)]))
    _,height=t.wrap(W-92,700);assert y-height>62;t.drawOn(c,46,y-height);y-=height+18
def end():c.showPage()
def diagram():
    global y
    top=y
    def box(x,dy,w,title,detail):
        c.setFillColor(HexColor('#f0f4e8'));c.setStrokeColor(LINE)
        c.roundRect(x,top-dy-45,w,45,6,fill=1,stroke=1)
        c.setFillColor(INK);c.setFont('Arial-Bold',9);c.drawCentredString(x+w/2,top-dy-17,title)
        c.setFont('Arial',8);c.drawCentredString(x+w/2,top-dy-32,detail)
    box(46,0,135,'Owner','openRound only')
    box(368,0,181,'Players / anyone','buy, reveal, finalize, refund')
    box(198,65,153,'FairLottery','Rounds + tickets + entropy')
    box(198,130,153,'Credit ledger','prize, fee, bond, refund')
    box(368,130,181,'Recipient wallet','withdraw: ETH transfer')
    c.setStrokeColor(INK)
    for x1,y1,x2,y2 in [(113,top-45,236,top-65),(458,top-45,313,top-65),(274,top-110,274,top-130),(351,top-152,368,top-152)]:
        c.line(x1,y1,x2,y2);c.circle(x2,y2,2,fill=1,stroke=0)
    y-=192

page(1,'A fair draw. A shared secret.','Design, implementation and evaluation report')
h('Team and assignment')
table([['Member','Student ID'],['Trương Đức Quốc Huy','29211154415'],['Trần Bảo Duy','28211354517']],[310,193])
p('<b>Project 10, Team 7.</b> Players purchase tickets using ETH on a local Ganache blockchain. The selected winner receives the ticket pot minus a small fee. The implementation uses Solidity 0.8.24, Hardhat, Ganache, ethers.js and a MetaMask web interface.')
h('Objective and scope')
p('The main objective is to demonstrate verifiable commitment-based randomness and explicit fund accounting. Each address purchases one ticket per round for 0.01 ETH and posts a 0.02 ETH reveal bond. A successful draw awards 98% of ticket sales to one winner and 2% to the immutable owner. Multiple wallets are permitted; an address is not proof of a unique person.')
p('All participants must reveal within the deadline. Otherwise the round cancels, ticket payments become claimable, and missing reveal bonds are forfeited when those players claim their refunds. This design avoids settling with a selectively incomplete secret set, but it does not prevent selective cancellation or denial of service.')
h('Delivered components')
p('The repository includes the contract, local compiler configuration, automated Ganache tests, deployment and smoke-demo scripts, a responsive web interface, measured transaction gas data, setup instructions and a timed 10-minute demo plan. This six-page report covers architecture, randomness, security, validation and gas analysis.')
p('<b>Evaluation boundary:</b> this is an educational prototype for local test ETH, not an independently audited or production-ready gambling service. Test results demonstrate specific scenarios rather than a proof of security.')
end()

page(2,'Contract design','State machine, roles and persistent accounting')
h('State transitions')
table([['Phase','Trigger and permitted actions'],['None → Open','Owner calls openRound(commitSeconds, revealSeconds); each window is at least 30 seconds.'],['Commit interval','buyTicket accepts exactly ticketPrice + revealBond before commitDeadline. One ticket per address; maximum 100 players.'],['Reveal interval','reveal verifies a secret from commitDeadline inclusive to revealDeadline exclusive; credits the bond.'],['Open → Settled','After revealDeadline, anyone finalizes if at least two players entered and all revealed.'],['Open → Cancelled','After revealDeadline, anyone finalizes if fewer than two players entered or any reveal is missing.'],['After resolution','Credits can be withdrawn; cancelled ticket refunds remain available even after another round opens.']],[123,380])
h('Contract diagram')
diagram()
p('Round metadata stores packed deadlines, status and reveal count; separate fields store entropy, winner and the ordered participant array. The tickets mapping binds each address to its commitment and claim flags. The credits ledger separates entitlement from external ETH transfers. WithdrawalProbe is test-only and is never deployed by the application deployment script.')
end()

page(3,'Commit, reveal, verify','Randomness construction and its assumptions')
h('Why block data is unsafe')
p('Block timestamps and hashes are public or partially predictable, and block producers can influence timing and transaction inclusion. Hashing predictable inputs does not create a new private entropy source. A participant may also wait for favorable block conditions before submitting a transaction. Solidity explicitly warns against relying on block.timestamp or blockhash as randomness [1]. This contract uses timestamps only for phase deadlines.')
h('Commitment and aggregation')
p('The browser generates an independent 32-byte secret using ethers.randomBytes. The commitment is keccak256(abi.encode(contractAddress, chainId, roundId, player, secret)). Including the deployment, chain, round and caller prevents a copied commitment from revealing successfully under a different identity or domain. The secret is persisted locally before the purchase is submitted and can be exported as a backup.')
p('During reveal the contract recomputes that commitment. If it matches and the ticket has not revealed, the contract marks the reveal, credits its bond, and XORs keccak256(abi.encode(player, secret)) into a running accumulator. Identity-bound contributions avoid identical secrets trivially cancelling each other. XOR makes the accumulator independent of reveal order.')
p('For a successful round, random = uint256(keccak256(abi.encode(contractAddress, chainId, roundId, accumulator))). The winner is players[random % playerCount], where player order is fixed by purchases. At most 100 possible outcomes makes modulo bias negligible relative to the 256-bit hash space, but not mathematically zero.')
h('Fairness qualification')
p('A completed draw assumes at least one honest, unpredictable secret and that all parties reveal. The final revealer can see earlier secrets, calculate the outcome, and withhold if it dislikes the result. We cancel instead of selecting a winner from fewer contributions. The bond adds an economic cost but cannot guarantee participation or unbiased completion, particularly under collusion or high-value pots. Production use should consider verified VRF plus explicit oracle timeout and refund rules [3].')
end()

page(4,'Security considerations','Threats, mitigations and remaining limitations')
table([['Threat','Implemented response and residual risk'],['Withholding / last revealer','Cancel on any missing reveal; refund tickets and forfeit missing bonds. Selective cancellation and denial of service remain possible. Owner receives forfeited bonds, creating a beneficiary incentive.'],['Reentrancy / bad recipient','Withdrawals clear credits before calling the recipient, use a lock, and revert on transfer failure. A recipient cannot block settlement or other users. Caller can retry with another address.'],['Replay / copied secrets','Commitments bind contract, chain, round and player. Reveal requires the matching caller and rejects repeated reveals.'],['Owner abuse','Only opening is privileged. Fee, owner, ticket price and bond are immutable. Owner cannot settle early or redraw; owner can refuse to open future rounds.'],['Storage loss / browser compromise','Secret backup and restore are supported and checked against the ticket. Plaintext localStorage remains vulnerable to XSS, device compromise and clearing browser data.'],['Boundary timing / stale UI','Nonoverlapping timestamp intervals are enforced on-chain. UI polls state and disables ineligible actions; signing delays can still cause a transaction to revert.'],['Locked or surplus funds','Pull credits and old-round claims survive new rounds. Unclaimed funds remain escrowed; forcibly sent ETH is outside the accounting ledger and has no sweep path.']],[123,380])
h('Invariants and operational constraints')
p('Each ticket pays one price and one bond. A reveal credits a bond only once. A successful round credits precisely ticketCount × ticketPrice between winner and owner; a cancelled round credits one ticket-price refund per claimant. Missing bonds are credited to the owner only when the corresponding refund is claimed. These rules avoid pooled cross-round payouts; no cancellation fee is taken from ticket payments.')
p('No iteration is required for settlement or refunds. The 100-player cap bounds participant-list reads for the interface. Local Ganache keys must never be reused with real funds, and secret backup contents should not be projected during the demo.')
end()

page(5,'Validation and gas analysis','Measured on Ganache; transaction receipts are the evidence')
data=json.loads((ROOT/'docs/gas-results.json').read_text())
p(data['environment']+'. '+data['scenario'])
labels={'deployment':'Deployment','openRound':'Open round','buyTicket':'Buy ticket','revealFirst':'Reveal (first)','revealNext':'Reveal (next)','finalizeSuccess':'Finalize successful draw','finalizeCancelled':'Finalize cancellation','claimRefundRevealed':'Refund, revealed player','claimRefundMissing':'Refund, missing reveal','withdraw':'Withdraw credit'}
table([['Operation','Gas used']]+[[label,f"{data['gas'][key]:,}"] for key,label in labels.items()],[330,173])
h('Optimization and interpretation')
p('The running accumulator removes the need to loop through secrets during finalization. Each reveal performs constant work; finalization selects the winner in O(1), and refunds are separate O(1) claims. Round deadlines, status and reveal count share a packed storage slot. The optimizer is enabled with 200 runs. These are structural optimizations; no unmeasured percentage saving is claimed.')
p('Gas depends on storage history, participant role and cold/warm accesses. The data file records representative receipts from the test scenarios; each label retains its last measured invocation. ETH transaction cost equals gasUsed × effectiveGasPrice, not the gas count alone. Ganache measurements are reproducible classroom evidence, not a mainnet cost forecast.')
end()

page(6,'Tests and live demonstration','Reproducibility, presentation plan and references')
h('Automated validation')
p('The suite runs fresh in-process Ganache chains, independently of the desktop workspace. It checks deterministic winner recomputation, exact prize/fee/bond accounting, events, cancellation, empty and single-player rounds, access control, payment validation, duplicate tickets, phase boundaries, incorrect/copied/repeated/late secrets, early/repeated finalization, duplicate refunds, failed recipient transfers, reentrancy and claims across rounds. Captured results are in docs/test-results.txt. Test assertions cover substantially more than three require/revert failure cases.')
h('Reproduce and present')
p('Install from package-lock.json using npm ci. Run npm test, open desktop Ganache, run npm run deploy, then npm run dev. Connect MetaMask using the deployment script\'s actual chain ID and import only throwaway Ganache accounts. Hardhat is used for compilation/deployment; Truffle is not required. The compiler targets Paris for compatibility and is loaded from the pinned npm package.')
p('The 10-minute demo allocates two minutes to the problem/design, two minutes to ticket purchases, two minutes to reveals, one minute to finalization/withdrawal, one minute to tests/gas, and two minutes to cancellation/refunds. The UI defaults to 120-second phases; a second 30/30-second round demonstrates non-reveal cancellation. docs/DEMO.md gives the detailed sequence. The automated desktop smoke demo uses a separate contract and local time travel, so it should run before opening a live UI round.')
h('References')
p('[1] Solidity documentation: Units and Globally Available Variables. https://docs.soliditylang.org/en/latest/units-and-global-variables.html (accessed 16 November 2026).')
p('[2] Solidity documentation: Security Considerations, including randomness and reentrancy. https://docs.soliditylang.org/en/latest/security-considerations.html (accessed 16 November 2026).')
p('[3] Chainlink documentation: VRF overview. https://docs.chain.link/vrf (accessed 16 November 2026).')
p('[4] Truffle Suite archive: Ganache settings. https://archive.trufflesuite.com/docs/ganache/reference/ganache-settings/ (accessed 16 November 2026).')
end();c.save()
print(OUT/'team7-project-report.pdf')
try:
    import pypdfium2 as pdfium
    doc=pdfium.PdfDocument(OUT/'team7-project-report.pdf')
    qa=ROOT/'tmp/pdfs';qa.mkdir(parents=True,exist_ok=True)
    for i,page_obj in enumerate(doc):
        page_obj.render(scale=1.2).to_pil().save(qa/f'page-{i+1}.png')
    print(f'Rendered {len(doc)} pages for visual QA')
except ImportError:
    print('Install pymupdf to render QA images.')
