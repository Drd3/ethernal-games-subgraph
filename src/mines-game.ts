import { GameCreated, CellResolved, CommitCell } from "../generated/MinesGame/MinesGame";
import { CashedOut } from "../generated/MinesGame/MinesGame";
import { MineGame } from "../generated/schema";
import { BigInt, Bytes, BigDecimal } from "@graphprotocol/graph-ts";
import { updateTotalGames, updateTotalStaked, updateTotalUsers } from "./game-stats";

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

export function handleGameCreated(event: GameCreated): void {
  let id = event.params.player;
  let entity = getOrCreateMineGame(id);

  entity.player = event.params.player;
  entity.gameId = event.params.gameId;
  const stakeAmount = event.params.stake.div(BigInt.fromI32(10).pow(18));
  entity.stake = stakeAmount;
  
  // Update total staked and stakers
  updateTotalStaked(stakeAmount, event.block.timestamp);
  
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

const manageGameStatus = (isMine: boolean, cells: i32, remainingMines: i32, revealedCells: i32[]): boolean => {
  // active states only manages whether the game is over or not 
  if(isMine) {
    return false; // So it's a loss, game isnt active
  }else {
    let totalPosibleCells = cells - remainingMines;
    if(totalPosibleCells == revealedCells.length) {
      return false; // So it's a win, game isnt active because all possible cells are revealed
    }
    return true; // the game continue as active, because there are still mines to reveal
  }
}

export function handleCellResolved(event: CellResolved): void {
  // TODO: Implement once ID strategy is finalized (likely player + gameId)
  let id = event.params.player;
  let entity = getOrCreateMineGame(id);
  let revealed = entity.revealedCells;

  entity.isMine = event.params.isMine;
  entity.active = manageGameStatus(event.params.isMine, entity.remainingCells, entity.remainingMines, revealed);
  entity.vrfPending = false;
  entity.cumMul = event.params.cumMulWad.toBigDecimal().div(BigDecimal.fromString("1000000000000000000"));
  entity.vrfRequestId = BigInt.zero();
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

