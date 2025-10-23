import { BigInt } from "@graphprotocol/graph-ts";
import { PlatformStats } from "../generated/schema";

// get-or-create helper for TotalStakes
export function getOrCreateGameStats(): PlatformStats {
  let id = '1';
  let platformStats = PlatformStats.load(id);
  if (platformStats == null) {
    platformStats = new PlatformStats(id);
    platformStats.totalStaked = BigInt.zero();
    platformStats.totalGames = BigInt.zero();
    platformStats.totalUsers = BigInt.zero();
    platformStats.updatedAt = BigInt.zero();
  }
  return platformStats as PlatformStats;
}

// Helper to update total staked amount
export function updateTotalStaked(amount: BigInt, timestamp: BigInt): void {
  let platformStats = getOrCreateGameStats();
  platformStats.totalStaked = platformStats.totalStaked.plus(amount);
  platformStats.updatedAt = timestamp;
  platformStats.save();
}

// Helper to update total games count
export function updateTotalGames(delta: i32, timestamp: BigInt): void {
  let platformStats = getOrCreateGameStats();
  platformStats.totalGames = platformStats.totalGames.plus(BigInt.fromI32(delta));
  platformStats.updatedAt = timestamp;
  platformStats.save();
}

// Helper to update total users count
export function updateTotalUsers(delta: i32, timestamp: BigInt): void {
  let platformStats = getOrCreateGameStats();
  platformStats.totalUsers = platformStats.totalUsers.plus(BigInt.fromI32(delta));
  platformStats.updatedAt = timestamp;
  platformStats.save();
}