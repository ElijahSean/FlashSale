--[[
  The purchase gate. The only place stock is ever decremented (design rule 1).

  Why a Lua script: Redis runs a script start to finish with no other command in between.
  So "check stock, then take one" cannot be split by another buyer doing the same thing.
  Without this, two requests could both read "1 left" and both take it: an oversell.

  KEYS[1] = sale:config  (hash: startsAt, endsAt in epoch ms)
  KEYS[2] = sale:stock   (integer: units left)
  KEYS[3] = sale:buyers  (set: userIds who secured a unit)
  ARGV[1] = userId       (normalized at login, rule 10)

  Returns one of: SUCCESS, ALREADY_PURCHASED, SOLD_OUT, NOT_STARTED, ENDED.
  This result is the only thing that decides a purchase (rule 3).
]]

-- Rule 9, one clock: Redis's own time, never the API server's. TIME gives {seconds, microseconds}.
local t = redis.call('TIME')
-- Convert to epoch milliseconds, the same unit sale:config stores.
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

-- Read the sale window. Both values were written by the seeder (02).
local startsAt = tonumber(redis.call('HGET', KEYS[1], 'startsAt'))
local endsAt = tonumber(redis.call('HGET', KEYS[1], 'endsAt'))
-- No config means the sale was never seeded. Fail loudly: the API turns this error into 503.
if not startsAt or not endsAt then
  return redis.error_reply('SALE_NOT_CONFIGURED')
end

-- Half-open window [startsAt, endsAt), the same rule as the status endpoint (computeStatus).
if now < startsAt then
  return 'NOT_STARTED'
end
if now >= endsAt then
  return 'ENDED'
end

-- Rule 2, one unit per user. Checked before stock, so a buyer who comes back after the sale
-- sells out is told "you already have one", which is the more useful answer.
if redis.call('SISMEMBER', KEYS[3], ARGV[1]) == 1 then
  return 'ALREADY_PURCHASED'
end

-- A missing stock key counts as 0, so the gate fails safe instead of selling.
local stock = tonumber(redis.call('GET', KEYS[2]) or '0')
-- Nothing is written on this path, so stock can never go below 0.
if stock <= 0 then
  return 'SOLD_OUT'
end

-- Reserve: take one unit and record the buyer. Both happen or neither, because the script is atomic.
redis.call('DECR', KEYS[2])
redis.call('SADD', KEYS[3], ARGV[1])
return 'SUCCESS'
