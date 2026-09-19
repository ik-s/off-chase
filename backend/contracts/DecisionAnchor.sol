// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract DecisionAnchor is Ownable {
    uint64 public constant DECISION_WINDOW = 30;

    struct RequestAnchorData {
        bytes32 requestHash;
        bytes32 policyHash;
        uint64 requestAnchoredAt;
        uint64 decisionDeadline;
        bytes32 decisionHash;
        uint64 decisionAnchoredAt;
    }

    mapping(bytes32 => RequestAnchorData) public records;

    event RequestAnchored(
        bytes32 indexed requestKey,
        bytes32 requestHash,
        bytes32 policyHash,
        uint64 requestAnchoredAt,
        uint64 decisionDeadline
    );

    event DecisionAnchored(
        bytes32 indexed requestKey,
        bytes32 decisionHash,
        uint64 decisionAnchoredAt
    );

    constructor(address gateway) Ownable(gateway) {}

    function anchorRequest(bytes32 requestKey, bytes32 requestHash, bytes32 policyHash) external onlyOwner {
        require(requestHash != bytes32(0) && policyHash != bytes32(0), "INVALID_ANCHOR_HASH");
        require(records[requestKey].requestHash == bytes32(0), "REQUEST_ALREADY_ANCHORED");
        uint64 observedAt = uint64(block.timestamp);
        uint64 deadline = observedAt + DECISION_WINDOW;
        records[requestKey] = RequestAnchorData({
            requestHash: requestHash,
            policyHash: policyHash,
            requestAnchoredAt: observedAt,
            decisionDeadline: deadline,
            decisionHash: bytes32(0),
            decisionAnchoredAt: 0
        });
        emit RequestAnchored(requestKey, requestHash, policyHash, observedAt, deadline);
    }

    function anchorDecision(bytes32 requestKey, bytes32 decisionHash) external onlyOwner {
        require(decisionHash != bytes32(0), "INVALID_ANCHOR_HASH");
        RequestAnchorData storage record = records[requestKey];
        require(record.requestHash != bytes32(0), "UNVERIFIED_REQUEST");
        require(record.decisionHash == bytes32(0), "DECISION_ALREADY_ANCHORED");
        require(block.timestamp <= record.decisionDeadline, "DEADLINE_EXPIRED");
        record.decisionHash = decisionHash;
        record.decisionAnchoredAt = uint64(block.timestamp);
        emit DecisionAnchored(requestKey, decisionHash, record.decisionAnchoredAt);
    }
}
