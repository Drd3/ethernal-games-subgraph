import { GameCreated, CellResolved, CommitCell } from "../generated/MinesGame/MinesGame";
import { CashedOut } from "../generated/MinesGame/MinesGame";
import { MineGame, PlatformStats } from "../generated/schema";
import { BigInt, Bytes, BigDecimal, Address } from "@graphprotocol/graph-ts";

// get-or-create helper for MineGame
function getOrCreateMineGame(id: Bytes): MineGame {
  let entity = MineGame.load(id);
  if (entity == null) {
    entity = new MineGame(id);
    // minimal defaults; specific fields will be set by the handler
    entity.cumMul = BigDecimal.zero();
    entity.steps = 0;
    entity.active = false;
    entity.vrfPending = false;
    entity.vrfRequestId = BigInt.zero();
    entity.isMine = false;
    entity.revealedCells = [];
    entity.pendingCell = -1;
    entity.cashedOut = false;
    entity.cashoutAmount = BigDecimal.zero();
  }
  return entity as MineGame;
}

// get-or-create helper for TotalStakes
function getOrCreateTotalStakes(): PlatformStats {
  let id = '1';
  let totalStakes = PlatformStats.load(id);
  if (totalStakes == null) {
    totalStakes = new PlatformStats(id);
    totalStakes.totalStaked = BigInt.zero();
    totalStakes.totalStakers = BigInt.zero();
    totalStakes.totalGames = BigInt.zero();
    totalStakes.totalUsers = BigInt.zero();
    totalStakes.updatedAt = BigInt.zero();
  }
  return totalStakes as PlatformStats;
}

// Helper to update total stakers count
function updateTotalStakers(delta: i32, timestamp: BigInt): void {
  let totalStakes = getOrCreateTotalStakes();
  totalStakes.totalStakers = totalStakes.totalStakers.plus(BigInt.fromI32(delta));
  totalStakes.updatedAt = timestamp;
  totalStakes.save();
}

// Helper to update total staked amount
function updateTotalStaked(amount: BigInt, timestamp: BigInt, isAdd: boolean = true): void {
  let totalStakes = getOrCreateTotalStakes();
  if (isAdd) {
    totalStakes.totalStaked = totalStakes.totalStaked.plus(amount);
  } else {
    totalStakes.totalStaked = totalStakes.totalStaked.minus(amount);
  }
  totalStakes.updatedAt = timestamp;
  totalStakes.save();
}

// Helper to update total games count
function updateTotalGames(delta: i32, timestamp: BigInt): void {
  let totalStakes = getOrCreateTotalStakes();
  totalStakes.totalGames = totalStakes.totalGames.plus(BigInt.fromI32(delta));
  totalStakes.updatedAt = timestamp;
  totalStakes.save();
}

// Helper to update total users count
function updateTotalUsers(delta: i32, timestamp: BigInt): void {
  let totalStakes = getOrCreateTotalStakes();
  totalStakes.totalUsers = totalStakes.totalUsers.plus(BigInt.fromI32(delta));
  totalStakes.updatedAt = timestamp;
  totalStakes.save();
}

export function handleGameCreated(event: GameCreated): void {
  let id = event.params.player;
  let entity = getOrCreateMineGame(id);

  entity.player = event.params.player;
  entity.gameId = event.params.gameId;
  const stakeAmount = event.params.stake.div(BigInt.fromI32(10).pow(18));
  entity.stake = stakeAmount;
  
  // Update total staked and stakers
  updateTotalStaked(stakeAmount, event.block.timestamp);
  
  // Check if this is a new user
  let previousGame = MineGame.load(id);
  const isNewUser = !previousGame || previousGame.stake.equals(BigInt.zero());
  
  if (isNewUser) {
    updateTotalStakers(1, event.block.timestamp);
    updateTotalUsers(1, event.block.timestamp);
  }
  
  // Increment total games counter for each new game
  updateTotalGames(1, event.block.timestamp);
  
  let cells = event.params.totalCells.toI32();
  let tableDimensions = 0;

  if (cells == 9) tableDimensions = 0;
  if (cells == 25) tableDimensions = 1;
  if (cells == 49) tableDimensions = 2;
  if (cells == 64) tableDimensions = 3;
  entity.tableDimension = tableDimensions;
  entity.remainingCells = cells;
  entity.remainingMines = event.params.totalMines.toI32();

  // Initialize other required fields from the schema
  entity.cumMul = BigDecimal.fromString("1");
  entity.steps = 0;
  entity.active = true;
  entity.vrfPending = false;
  entity.vrfRequestId = BigInt.fromI32(0);
  entity.isMine = false;
  entity.revealedCells = [];
  entity.pendingCell = -1;
  entity.cashedOut = false;

  entity.save();
}

export function handleCommitCell(event: CommitCell): void {
  // TODO: Implement once ID strategy is finalized (likely player + gameId)
  let id = event.params.player;
  let entity = getOrCreateMineGame(id);

  entity.vrfPending = true;
  entity.vrfRequestId = event.params.requestId;
  entity.pendingCell = event.params.cellIndex.toI32();
  entity.save();
}

export function handleCellResolved(event: CellResolved): void {
  // TODO: Implement once ID strategy is finalized (likely player + gameId)
  let id = event.params.player;
  let entity = getOrCreateMineGame(id);

  entity.isMine = event.params.isMine;
  entity.active = !event.params.isMine;
  entity.vrfPending = false;
  entity.cumMul = event.params.cumMulWad.toBigDecimal().div(BigDecimal.fromString("1000000000000000000"));
  entity.vrfRequestId = BigInt.zero();
  let revealed = entity.revealedCells;
  revealed.push(event.params.cellIndex.toI32());
  entity.revealedCells = revealed;
  entity.pendingCell = -1;
  entity.save();
}

export function handleCashedOut(event: CashedOut): void {
  // TODO: Implement once ID strategy is finalized (likely player + gameId)
  let id = event.params.player;
  let entity = getOrCreateMineGame(id);

  const cashoutAmount = event.params.amount;
  entity.cashoutAmount = cashoutAmount.toBigDecimal().div(BigDecimal.fromString("1000000000000000000"));
  entity.active = false;
  
  // Update total staked when user cashes out
  if (entity.stake.gt(BigInt.zero())) {
    updateTotalStaked(entity.stake, event.block.timestamp, false);
    // If they cashed out their full stake, decrement stakers count
    if (entity.stake.plus(cashoutAmount).equals(BigInt.zero())) {
      updateTotalStakers(-1, event.block.timestamp);
    }
  }
  
  entity.cashedOut = true;
  // Reset gameplay-related state
  entity.vrfPending = false;
  entity.vrfRequestId = BigInt.zero();
  entity.isMine = false;
  entity.revealedCells = [];
  entity.pendingCell = 0;
  entity.steps = 0;
  entity.cumMul = BigDecimal.zero();
  entity.remainingCells = 0;
  entity.remainingMines = 0;
  entity.stake = BigInt.zero();
  entity.save();
}

