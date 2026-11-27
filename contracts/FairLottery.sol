// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Classroom commit-reveal lottery. All players must reveal or the round cancels.
contract FairLottery {
    enum Status { None, Open, Settled, Cancelled }
    struct Round {
        uint64 commitDeadline;
        uint64 revealDeadline;
        Status status;
        uint32 revealed;
        uint256 entropy;
        address winner;
        address[] players;
        address[] ticketOwners;
    }
    struct Ticket { bytes32 commitment; bool revealed; bool refunded; uint32 quantity; }
    address public immutable owner;
    uint256 public immutable ticketPrice;
    uint256 public immutable revealBond;
    uint256 public immutable feeBps;
    uint256 public constant MAX_PLAYERS = 100;
    uint256 public constant MAX_TICKETS = 1000;
    uint256 public constant MAX_TICKETS_PER_WALLET = 100;
    uint256 public currentRound;
    mapping(uint256 => Round) private rounds;
    mapping(uint256 => mapping(address => Ticket)) public tickets;
    mapping(address => uint256) public credits;
    bool private locked;

    event RoundOpened(uint256 indexed roundId, uint256 commitDeadline, uint256 revealDeadline);
    event TicketBought(uint256 indexed roundId, address indexed player, bytes32 commitment);
    event TicketsBought(uint256 indexed roundId, address indexed player, uint256 quantity, uint256 totalOwned);
    event SecretRevealed(uint256 indexed roundId, address indexed player);
    event WinnerSelected(uint256 indexed roundId, address indexed winner, uint256 prize, uint256 fee);
    event RoundCancelled(uint256 indexed roundId, uint256 missingReveals);
    event RefundClaimed(uint256 indexed roundId, address indexed player, uint256 amount);
    event Withdrawal(address indexed account, address indexed recipient, uint256 amount);

    constructor(uint256 price, uint256 bond, uint256 fee) {
        require(price > 0 && bond > 0, "Zero price or bond");
        require(fee <= 1000, "Fee exceeds 10%");
        owner = msg.sender; ticketPrice = price; revealBond = bond; feeBps = fee;
    }
    function openRound(uint64 commitSeconds, uint64 revealSeconds) external {
        require(msg.sender == owner, "Owner only");
        require(currentRound == 0 || rounds[currentRound].status != Status.Open, "Round active");
        require(commitSeconds >= 30 && revealSeconds >= 30, "Window too short");
        Round storage r = rounds[++currentRound];
        r.commitDeadline = uint64(block.timestamp) + commitSeconds;
        r.revealDeadline = r.commitDeadline + revealSeconds;
        r.status = Status.Open;
        emit RoundOpened(currentRound, r.commitDeadline, r.revealDeadline);
    }
    function commitmentFor(uint256 id, address player, bytes32 secret) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), block.chainid, id, player, secret));
    }
    function buyTicket(uint256 id, bytes32 commitment) external payable {
        _buyTickets(id, commitment, 1);
    }
    function buyTickets(uint256 id, bytes32 commitment, uint32 quantity) external payable {
        _buyTickets(id, commitment, quantity);
    }
    function _buyTickets(uint256 id, bytes32 commitment, uint32 quantity) private {
        Round storage r = rounds[id];
        require(r.status == Status.Open && block.timestamp < r.commitDeadline, "Commit closed");
        Ticket storage t = tickets[id][msg.sender];
        bool first = t.commitment == bytes32(0);
        require(quantity > 0 && uint256(t.quantity) + quantity <= MAX_TICKETS_PER_WALLET, "Invalid quantity");
        require(r.ticketOwners.length + quantity <= MAX_TICKETS, "Ticket cap reached");
        require(msg.value == ticketPrice * quantity + (first ? revealBond : 0), "Wrong payment");
        require(commitment != bytes32(0), "Empty commitment");
        if (first) {
            require(r.players.length < MAX_PLAYERS, "Round full");
            t.commitment = commitment;
            r.players.push(msg.sender);
        } else {
            require(t.commitment == commitment, "Use original commitment");
        }
        t.quantity += quantity;
        for (uint256 i; i < quantity; ++i) r.ticketOwners.push(msg.sender);
        emit TicketBought(id, msg.sender, commitment);
        emit TicketsBought(id, msg.sender, quantity, t.quantity);
    }
    function reveal(uint256 id, bytes32 secret) external {
        Round storage r = rounds[id];
        require(r.status == Status.Open && block.timestamp >= r.commitDeadline && block.timestamp < r.revealDeadline, "Reveal closed");
        Ticket storage t = tickets[id][msg.sender];
        require(t.commitment != bytes32(0), "No ticket");
        require(!t.revealed, "Already revealed");
        require(commitmentFor(id, msg.sender, secret) == t.commitment, "Invalid secret");
        t.revealed = true;
        r.revealed++;
        // Hash player identity into each contribution; XOR makes reveal order irrelevant.
        r.entropy ^= uint256(keccak256(abi.encode(msg.sender, secret)));
        credits[msg.sender] += revealBond;
        emit SecretRevealed(id, msg.sender);
    }
    function finalize(uint256 id) external {
        Round storage r = rounds[id];
        uint256 count = r.players.length;
        bool allRevealed = count >= 2 && r.revealed == count && block.timestamp >= r.commitDeadline;
        require(r.status == Status.Open && (block.timestamp >= r.revealDeadline || allRevealed), "Not finalizable");
        if (count < 2 || r.revealed != count) {
            r.status = Status.Cancelled;
            emit RoundCancelled(id, count - r.revealed);
            return;
        }
        r.status = Status.Settled;
        uint256 random = uint256(keccak256(abi.encode(address(this), block.chainid, id, r.entropy)));
        r.winner = r.ticketOwners[random % r.ticketOwners.length];
        uint256 pot = r.ticketOwners.length * ticketPrice;
        uint256 fee = pot * feeBps / 10000;
        credits[r.winner] += pot - fee;
        credits[owner] += fee;
        emit WinnerSelected(id, r.winner, pot - fee, fee);
    }
    function claimRefund(uint256 id) external {
        Round storage r = rounds[id];
        require(r.status == Status.Cancelled, "Not cancelled");
        Ticket storage t = tickets[id][msg.sender];
        require(t.commitment != bytes32(0) && !t.refunded, "No refund");
        t.refunded = true;
        // Non-revealers forfeit the bond; nobody earns a fee on cancelled ticket sales.
        uint256 refund = ticketPrice * t.quantity;
        credits[msg.sender] += refund;
        if (!t.revealed) credits[owner] += revealBond;
        emit RefundClaimed(id, msg.sender, refund);
    }
    function withdraw(address payable recipient) external {
        require(!locked, "Reentrancy");
        require(recipient != address(0), "Zero recipient");
        uint256 amount = credits[msg.sender];
        require(amount > 0, "No credit");
        locked = true;
        credits[msg.sender] = 0;
        (bool ok,) = recipient.call{value: amount}("");
        require(ok, "Transfer failed");
        locked = false;
        emit Withdrawal(msg.sender, recipient, amount);
    }
    function getRound(uint256 id) external view returns (
        uint64 commitDeadline, uint64 revealDeadline, Status status, uint32 revealed,
        uint256 entropy, address winner, uint256 playerCount, uint256 totalTickets
    ) {
        Round storage r = rounds[id];
        return (r.commitDeadline, r.revealDeadline, r.status, r.revealed, r.entropy, r.winner, r.players.length, r.ticketOwners.length);
    }
    function getPlayers(uint256 id) external view returns (address[] memory) { return rounds[id].players; }
    function getTicketOwners(uint256 id) external view returns (address[] memory) { return rounds[id].ticketOwners; }
}
