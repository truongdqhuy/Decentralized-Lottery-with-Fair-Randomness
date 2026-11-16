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
    }
    struct Ticket { bytes32 commitment; bool revealed; bool refunded; }
    address public immutable owner;
    uint256 public immutable ticketPrice;
    uint256 public immutable revealBond;
    uint256 public immutable feeBps;
    uint256 public constant MAX_PLAYERS = 100;
    uint256 public currentRound;
    mapping(uint256 => Round) private rounds;
    mapping(uint256 => mapping(address => Ticket)) public tickets;
    mapping(address => uint256) public credits;
    bool private locked;

    event RoundOpened(uint256 indexed roundId, uint256 commitDeadline, uint256 revealDeadline);
    event TicketBought(uint256 indexed roundId, address indexed player, bytes32 commitment);
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
        Round storage r = rounds[id];
        require(r.status == Status.Open && block.timestamp < r.commitDeadline, "Commit closed");
        require(msg.value == ticketPrice + revealBond, "Wrong payment");
        require(commitment != bytes32(0), "Empty commitment");
        require(tickets[id][msg.sender].commitment == bytes32(0), "Already entered");
        require(r.players.length < MAX_PLAYERS, "Round full");
        tickets[id][msg.sender].commitment = commitment;
        r.players.push(msg.sender);
        emit TicketBought(id, msg.sender, commitment);
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
        require(r.status == Status.Open && block.timestamp >= r.revealDeadline, "Not finalizable");
        uint256 count = r.players.length;
        if (count < 2 || r.revealed != count) {
            r.status = Status.Cancelled;
            emit RoundCancelled(id, count - r.revealed);
            return;
        }
        r.status = Status.Settled;
        uint256 random = uint256(keccak256(abi.encode(address(this), block.chainid, id, r.entropy)));
        r.winner = r.players[random % count];
        uint256 pot = count * ticketPrice;
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
        credits[msg.sender] += ticketPrice;
        if (!t.revealed) credits[owner] += revealBond;
        emit RefundClaimed(id, msg.sender, ticketPrice);
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
        uint256 entropy, address winner, uint256 playerCount
    ) {
        Round storage r = rounds[id];
        return (r.commitDeadline, r.revealDeadline, r.status, r.revealed, r.entropy, r.winner, r.players.length);
    }
    function getPlayers(uint256 id) external view returns (address[] memory) { return rounds[id].players; }
}
