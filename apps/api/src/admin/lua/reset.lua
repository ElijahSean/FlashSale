--[[
  Resets the sale for a stress test run. Buyers never call this.

  Why Lua: stock only changes inside Lua (rule 1). Window, stock and buyers
  change together in one step, so a purchase never sees half a reset.

  A window "starting in N seconds" uses Redis's clock (rule 9).

  KEYS[1] = sale:config
  KEYS[2] = sale:stock
  KEYS[3] = sale:buyers
  ARGV[1] = stock
  ARGV[2] = 'absolute': ARGV[3], ARGV[4] are startsAt, endsAt in ms
            'relative': ARGV[3], ARGV[4] are "starts in" and "lasts" in ms

  Returns { startsAt, endsAt } in ms.
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

-- Save as whole numbers, the same format the seeder writes.
startsAt = string.format('%d', startsAt)
endsAt = string.format('%d', endsAt)

redis.call('HSET', KEYS[1], 'startsAt', startsAt, 'endsAt', endsAt, 'initialStock', ARGV[1])
redis.call('SET', KEYS[2], ARGV[1])
redis.call('DEL', KEYS[3])
return { startsAt, endsAt }
