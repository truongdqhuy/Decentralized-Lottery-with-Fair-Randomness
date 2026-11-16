// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
interface ILottery {
    function buyTicket(uint256, bytes32) external payable;
    function reveal(uint256, bytes32) external;
    function withdraw(address payable) external;
}
/// @dev Test-only recipient that attempts to withdraw twice during a callback.
contract WithdrawalProbe {
    ILottery public lottery;
    bool public attempted;
    bool public reentered;
    constructor(address target) { lottery = ILottery(target); }
    function enter(uint256 id, bytes32 c) external payable { lottery.buyTicket{value: msg.value}(id, c); }
    function reveal(uint256 id, bytes32 s) external { lottery.reveal(id, s); }
    function withdraw() external { lottery.withdraw(payable(address(this))); }
    receive() external payable {
        attempted = true;
        (reentered,) = address(lottery).call(abi.encodeWithSignature("withdraw(address)", address(this)));
    }
}
