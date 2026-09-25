--[[
  Resets the sale for a test run (requirement 07, admin reset). Never used by buyers.

  Why a Lua script: rule 1 says stock only changes inside Lua, never through a read-then-write in
  the API. Here the window, the stock and the buyers set change together in one atomic step, so a
  purchase can never see new stock with old buyers (or the other way round).

  Rule 9, one clock: for a window "starting in N seconds" the start is computed from Redis TIME,
  the same clock purchase.lua compares against. The API's clock is never used.

  KEYS[1] = sale:config
  KEYS[2] = sale:stock
  KEYS[3] = sale:buyers
  ARGV[1] = stock
  ARGV[2] = 'absolute' (ARGV[3], ARGV[4] are startsAt, endsAt in epoch ms)
            or 'relative' (ARGV[3], ARGV[4] are "starts in" and "lasts" in ms)

  Returns { startsAt, endsAt } as strings (epoch ms).
]]

local startsAt, endsAt
if ARGV[2] == 'relative' then
  local t = redis.call('TIME')
  local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
  startsAt = now + tonumber(ARGV[3])
  endsAt = startsAt + tonumber(ARGV[4])
else
  startsAt = tonumber(ARGV[3])
  endsAt = tonumber(ARGV[4])
end

-- Stored as plain whole-number strings, the same format the seeder (02) writes.
startsAt = string.format('%d', startsAt)
endsAt = string.format('%d', endsAt)

redis.call('HSET', KEYS[1], 'startsAt', startsAt, 'endsAt', endsAt, 'initialStock', ARGV[1])
redis.call('SET', KEYS[2], ARGV[1])
redis.call('DEL', KEYS[3])
return { startsAt, endsAt }
